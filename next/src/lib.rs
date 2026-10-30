use anyhow::{Context, Result};
use chrono::Utc;
use directories::ProjectDirs;
use encoding_rs::GB18030;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::ffi::{CStr, CString};
use std::fs;
use std::os::raw::c_char;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static DATABASE: OnceLock<Mutex<Connection>> = OnceLock::new();

fn data_path() -> Result<PathBuf> {
    let root = ProjectDirs::from("com", "Legado", "LegadoNext")
        .context("无法确定应用数据目录")?
        .data_dir()
        .to_path_buf();
    fs::create_dir_all(&root)?;
    Ok(root.join("reader.sqlite3"))
}

fn database() -> Result<&'static Mutex<Connection>> {
    if let Some(database) = DATABASE.get() {
        return Ok(database);
    }

    let connection = Connection::open(data_path()?)?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS books (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             author TEXT NOT NULL,
             source_path TEXT NOT NULL,
             imported_at INTEGER NOT NULL,
             updated_at INTEGER NOT NULL,
             chapter_count INTEGER NOT NULL,
             current_chapter INTEGER NOT NULL DEFAULT 0,
             current_pos INTEGER NOT NULL DEFAULT 0,
             sort_order INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS chapters (
             book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
             chapter_index INTEGER NOT NULL,
             title TEXT NOT NULL,
             content TEXT NOT NULL,
             PRIMARY KEY(book_id, chapter_index)
         );
         CREATE TABLE IF NOT EXISTS filters (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
             search TEXT NOT NULL,
             replacement TEXT NOT NULL DEFAULT ''
         );
         CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )?;

    // If another thread initialized the database first, use its connection.
    let _ = DATABASE.set(Mutex::new(connection));
    DATABASE.get().context("本地数据库初始化失败")
}

fn decode_text(bytes: &[u8]) -> String {
    let normalized = if let Ok(text) = std::str::from_utf8(bytes) {
        text.trim_start_matches('\u{feff}').to_string()
    } else {
        GB18030
            .decode(bytes)
            .0
            .trim_start_matches('\u{feff}')
            .to_string()
    };
    normalized.replace("\r\n", "\n").replace('\r', "\n")
}

fn chapter_line(line: &str) -> bool {
    let text = line.trim();
    if text.is_empty() || text.chars().count() > 80 {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    ["序章", "楔子", "引子", "前言", "后记", "终章", "番外"]
        .iter()
        .any(|prefix| text.starts_with(prefix))
        || (text.starts_with('第')
            && ["章", "节", "卷", "回", "集", "部", "篇"]
                .iter()
                .any(|suffix| text.contains(suffix)))
        || lower.starts_with("chapter ")
        || lower.starts_with("section ")
}

fn split_chapters(text: &str) -> Vec<(String, String)> {
    let lines: Vec<&str> = text.lines().collect();
    let titles: Vec<(usize, String)> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| chapter_line(line))
        .map(|(index, line)| (index, line.trim().to_string()))
        .collect();

    if titles.len() < 2 {
        let paragraphs: Vec<&str> = text
            .split("\n\n")
            .map(str::trim)
            .filter(|paragraph| !paragraph.is_empty())
            .collect();
        let mut result = Vec::new();
        let mut buffer = String::new();
        let mut length = 0;
        for paragraph in paragraphs {
            if length > 0 && length + paragraph.len() > 12_000 {
                result.push((
                    format!("第 {} 章", result.len() + 1),
                    buffer.trim().to_string(),
                ));
                buffer.clear();
                length = 0;
            }
            buffer.push_str(paragraph);
            buffer.push_str("\n\n");
            length += paragraph.len();
        }
        if !buffer.trim().is_empty() {
            result.push((
                if result.is_empty() {
                    "正文".to_string()
                } else {
                    format!("第 {} 章", result.len() + 1)
                },
                buffer.trim().to_string(),
            ));
        }
        if result.is_empty() && !text.trim().is_empty() {
            result.push(("正文".to_string(), text.trim().to_string()));
        }
        return result;
    }

    let mut result = Vec::new();
    if titles[0].0 > 0 {
        let preface = lines[..titles[0].0].join("\n").trim().to_string();
        if !preface.is_empty() {
            result.push(("前言".to_string(), preface));
        }
    }
    for (index, (line, title)) in titles.iter().enumerate() {
        let end = titles.get(index + 1).map_or(lines.len(), |item| item.0);
        let content = lines[line + 1..end].join("\n").trim().to_string();
        result.push((
            title.clone(),
            if content.is_empty() { title.clone() } else { content },
        ));
    }
    result
}

fn stable_book_id(path: &Path) -> String {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    format!("local://{}", canonical.to_string_lossy())
}

fn value_string(value: &Value, key: &str) -> Result<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .with_context(|| format!("缺少参数：{key}"))
}

fn books(connection: &Connection, query: &str) -> Result<Value> {
    let mut statement = connection.prepare(
        "SELECT id,name,author,chapter_count,current_chapter
         FROM books ORDER BY updated_at DESC, sort_order DESC",
    )?;
    let query = query.trim().to_lowercase();
    let rows = statement.query_map([], |row| {
        let chapters: i32 = row.get(3)?;
        let current: i32 = row.get(4)?;
        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "title": row.get::<_, String>(1)?,
            "author": row.get::<_, String>(2)?,
            "chapters": chapters,
            "progress": if chapters == 0 { "未开始".to_string() } else { format!("阅读到第 {} 章", current.clamp(0, chapters - 1) + 1) },
        }))
    })?;
    let mut result = Vec::new();
    for row in rows {
        let book = row?;
        let matches = query.is_empty()
            || book["title"].as_str().unwrap_or_default().to_lowercase().contains(&query)
            || book["author"].as_str().unwrap_or_default().to_lowercase().contains(&query);
        if matches {
            result.push(book);
        }
    }
    Ok(Value::Array(result))
}

fn filters(connection: &Connection, book_id: &str) -> Result<Value> {
    let mut statement = connection.prepare(
        "SELECT id,search,replacement FROM filters WHERE book_id=? ORDER BY id",
    )?;
    let rows = statement.query_map([book_id], |row| {
        Ok(json!({
            "id": row.get::<_, i32>(0)?,
            "search": row.get::<_, String>(1)?,
            "replacement": row.get::<_, String>(2)?,
        }))
    })?;
    Ok(Value::Array(rows.collect::<rusqlite::Result<Vec<_>>>()?))
}

fn chapter(connection: &Connection, book_id: &str, index: i32) -> Result<Value> {
    let (title, mut content): (String, String) = connection.query_row(
        "SELECT title,content FROM chapters WHERE book_id=? AND chapter_index=?",
        params![book_id, index],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    connection.execute(
        "UPDATE books SET current_chapter=?, current_pos=0, updated_at=? WHERE id=?",
        params![index, Utc::now().timestamp(), book_id],
    )?;
    let mut statement = connection.prepare("SELECT search,replacement FROM filters WHERE book_id=?")?;
    for row in statement.query_map([book_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })? {
        let (search, replacement) = row?;
        if !search.is_empty() {
            content = content.replace(&search, &replacement);
        }
    }
    Ok(json!({"index": index, "title": title, "content": content}))
}

fn open_book(connection: &Connection, id: &str) -> Result<Value> {
    let (title, author, current, position, count): (String, String, i32, i64, i32) = connection.query_row(
        "SELECT name,author,current_chapter,current_pos,chapter_count FROM books WHERE id=?",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )?;
    if count == 0 {
        anyhow::bail!("这本书没有可阅读的章节");
    }
    let current = current.clamp(0, count - 1);
    connection.execute(
        "UPDATE books SET current_chapter=?,updated_at=? WHERE id=?",
        params![current, Utc::now().timestamp(), id],
    )?;
    let mut statement = connection.prepare(
        "SELECT chapter_index,title FROM chapters WHERE book_id=? ORDER BY chapter_index",
    )?;
    let chapters = statement
        .query_map([id], |row| Ok(json!({"index": row.get::<_, i32>(0)?, "title": row.get::<_, String>(1)?})))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({
        "id": id,
        "title": title,
        "author": author,
        "current": current,
        "position": position,
        "chapters": chapters,
        "filters": filters(connection, id)?,
        "chapter": chapter(connection, id, current)?,
    }))
}

fn import_file(connection: &Connection, path: &Path) -> Result<Value> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() {
        anyhow::bail!("不是文件：{}", path.display());
    }
    let id = stable_book_id(path);
    let text = decode_text(&fs::read(path)?);
    let chapters = split_chapters(&text);
    let name = path.file_stem().and_then(|value| value.to_str()).unwrap_or("未命名");
    let now = Utc::now().timestamp();
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO books(id,name,author,source_path,imported_at,updated_at,chapter_count,current_chapter,current_pos,sort_order)
         VALUES (?,?,?,?,?,?,?,0,0,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_path=excluded.source_path,
         updated_at=excluded.updated_at,chapter_count=excluded.chapter_count,sort_order=excluded.sort_order",
        params![id, name, "本地导入", path.to_string_lossy(), now, now, chapters.len() as i32, now],
    )?;
    transaction.execute("DELETE FROM chapters WHERE book_id=?", [&id])?;
    for (index, (title, content)) in chapters.iter().enumerate() {
        transaction.execute(
            "INSERT INTO chapters(book_id,chapter_index,title,content) VALUES (?,?,?,?)",
            params![id, index as i32, title, content],
        )?;
    }
    transaction.commit()?;
    Ok(json!({"id": id, "title": name, "chapters": chapters.len()}))
}

fn command(request: &Value) -> Result<Value> {
    let connection = database()?.lock().map_err(|_| anyhow::anyhow!("数据库锁定失败"))?;
    match request.get("op").and_then(Value::as_str).unwrap_or_default() {
        "list_books" => Ok(json!({"books": books(&connection, request.get("query").and_then(Value::as_str).unwrap_or_default())?})),
        "import_file" => import_file(&connection, Path::new(&value_string(request, "path")?)),
        "open_book" => open_book(&connection, &value_string(request, "id")?),
        "chapter" => chapter(&connection, &value_string(request, "id")?, request.get("index").and_then(Value::as_i64).context("缺少章节索引")? as i32),
        "save_progress" => {
            let book_id = value_string(request, "id")?;
            let index = request.get("index").and_then(Value::as_i64).context("缺少章节索引")? as i32;
            let position = request.get("position").and_then(Value::as_i64).unwrap_or_default().max(0);
            connection.execute("UPDATE books SET current_chapter=?, current_pos=?, updated_at=? WHERE id=?", params![index, position, Utc::now().timestamp(), book_id])?;
            Ok(json!(true))
        }
        "filters" => filters(&connection, &value_string(request, "id")?),
        "add_filter" => {
            let search = value_string(request, "search")?;
            if search.trim().is_empty() { anyhow::bail!("过滤内容不能为空"); }
            connection.execute("INSERT INTO filters(book_id,search,replacement) VALUES (?,?,?)", params![value_string(request, "id")?, search, request.get("replacement").and_then(Value::as_str).unwrap_or_default()])?;
            Ok(json!(true))
        }
        "delete_filter" => { connection.execute("DELETE FROM filters WHERE id=?", [request.get("id").and_then(Value::as_i64).context("缺少过滤规则 id")?])?; Ok(json!(true)) }
        "delete_book" => { connection.execute("DELETE FROM books WHERE id=?", [value_string(request, "id")?])?; Ok(json!(true)) }
        "clear_all" => { connection.execute_batch("DELETE FROM books; DELETE FROM filters; DELETE FROM settings;")?; Ok(json!(true)) }
        "get_settings" => Ok(connection.query_row("SELECT value FROM settings WHERE key='reader'", [], |row| row.get::<_, String>(0)).optional()?.and_then(|value| serde_json::from_str(&value).ok()).unwrap_or_else(|| json!({"theme":0,"font":4,"fontSize":18,"lineSpacing":0.8,"paragraphSpacing":1.0,"letterSpacing":0.0,"readWidth":800,"jumpDuration":1000,"infiniteLoading":false}))),
        "save_settings" => { let settings = request.get("settings").context("缺少设置")?; connection.execute("INSERT INTO settings(key,value) VALUES ('reader',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [serde_json::to_string(settings)?])?; Ok(settings.clone()) }
        _ => anyhow::bail!("未知操作"),
    }
}

#[no_mangle]
/// Execute a JSON command against the local reader core.
///
/// # Safety
/// `request` must be null or point to a valid NUL-terminated C string for the duration of this call.
pub unsafe extern "C" fn legado_command(request: *const c_char) -> *mut c_char {
    let response = if request.is_null() {
        json!({"ok": false, "error": "请求为空"})
    } else {
        match CStr::from_ptr(request).to_str().ok().and_then(|text| serde_json::from_str(text).ok()) {
            Some(value) => match command(&value) { Ok(data) => json!({"ok": true, "data": data}), Err(error) => json!({"ok": false, "error": error.to_string()}) },
            None => json!({"ok": false, "error": "请求不是有效 JSON"}),
        }
    };
    CString::new(response.to_string()).expect("JSON 不应包含 NUL").into_raw()
}

#[no_mangle]
/// Release a string allocated by [`legado_command`].
///
/// # Safety
/// `value` must be null or a pointer previously returned by [`legado_command`] that has not been freed.
pub unsafe extern "C" fn legado_free(value: *mut c_char) {
    if !value.is_null() { drop(CString::from_raw(value)); }
}

#[cfg(test)]
mod tests {
    use super::{chapter_line, split_chapters};

    #[test]
    fn recognizes_chapter_titles() {
        assert!(chapter_line("第一章 初见"));
        assert!(chapter_line("Chapter 12"));
        assert!(!chapter_line("普通正文"));
    }

    #[test]
    fn keeps_preface_and_chapters() {
        let chapters = split_chapters("作者序\n说明\n\n第一章 开始\n甲\n\n第二章 继续\n乙");
        assert_eq!(chapters.len(), 3);
        assert_eq!(chapters[0].0, "前言");
        assert_eq!(chapters[2].1, "乙");
    }
}
