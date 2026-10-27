#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::{Context, Result};
use chrono::Utc;
use directories::ProjectDirs;
use encoding_rs::GB18030;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use slint::{Model, ModelRc, VecModel};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

slint::include_modules!();

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Settings {
    theme: i32,
    font: i32,
    font_size: i32,
    line_spacing: f32,
    paragraph_spacing: f32,
    letter_spacing: f32,
    read_width: i32,
    jump_duration: i32,
    infinite_loading: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: 0,
            font: 4,
            font_size: 18,
            line_spacing: 0.8,
            paragraph_spacing: 1.0,
            letter_spacing: 0.0,
            read_width: 800,
            jump_duration: 1000,
            infinite_loading: false,
        }
    }
}

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    current_book: Arc<Mutex<Option<String>>>,
    current_chapter: Arc<Mutex<i32>>,
}

fn data_path() -> Result<PathBuf> {
    let root = ProjectDirs::from("com", "Legado", "LegadoNext")
        .context("无法确定应用数据目录")?
        .data_dir()
        .to_path_buf();
    fs::create_dir_all(&root)?;
    Ok(root.join("reader.sqlite3"))
}

fn open_db() -> Result<Connection> {
    let conn = Connection::open(data_path()?)?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, name TEXT NOT NULL, author TEXT NOT NULL, source_path TEXT NOT NULL, imported_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, chapter_count INTEGER NOT NULL, current_chapter INTEGER NOT NULL DEFAULT 0, current_pos INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS chapters (book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, chapter_index INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY(book_id, chapter_index));
        CREATE TABLE IF NOT EXISTS filters (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, search TEXT NOT NULL, replacement TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")?;
    Ok(conn)
}

fn decode_text(bytes: &[u8]) -> String {
    let (utf8, _, had_errors) = std::str::from_utf8(bytes)
        .map(|s| (s, false, false))
        .unwrap_or(("", true, true));
    if !had_errors {
        return utf8
            .trim_start_matches('\u{feff}')
            .replace("\r\n", "\n")
            .replace('\r', "\n");
    }
    let (text, _, _) = GB18030.decode(bytes);
    text.trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n")
}

fn chapter_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() || t.len() > 80 {
        return false;
    }
    let lower = t.to_ascii_lowercase();
    ["序章", "楔子", "引子", "前言", "后记", "终章", "番外"]
        .iter()
        .any(|x| t.starts_with(x))
        || (t.starts_with('第')
            && ["章", "节", "卷", "回", "集", "部", "篇"]
                .iter()
                .any(|x| t.contains(x)))
        || lower.starts_with("chapter ")
        || lower.starts_with("section ")
}

fn split_chapters(text: &str) -> Vec<(String, String)> {
    let lines: Vec<&str> = text.lines().collect();
    let titles: Vec<(usize, String)> = lines
        .iter()
        .enumerate()
        .filter(|&(_, line)| chapter_line(line))
        .map(|(i, line)| (i, line.trim().to_string()))
        .collect();
    if titles.len() < 2 {
        let paragraphs: Vec<&str> = text
            .split("\n\n")
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .collect();
        let mut result = Vec::new();
        let mut buf = String::new();
        let mut n = 0;
        for paragraph in paragraphs {
            if n > 0 && n + paragraph.len() > 12000 {
                result.push((
                    format!("第 {} 章", result.len() + 1),
                    buf.trim().to_string(),
                ));
                buf.clear();
                n = 0;
            }
            buf.push_str(paragraph);
            buf.push_str("\n\n");
            n += paragraph.len();
        }
        if !buf.trim().is_empty() {
            result.push((
                if result.is_empty() {
                    "正文".into()
                } else {
                    format!("第 {} 章", result.len() + 1)
                },
                buf.trim().into(),
            ));
        }
        return result;
    }
    let mut result = Vec::new();
    if titles[0].0 > 0 {
        let preface = lines[..titles[0].0].join("\n").trim().to_string();
        if !preface.is_empty() {
            result.push(("前言".into(), preface));
        }
    }
    for (i, (line, title)) in titles.iter().enumerate() {
        let end = titles.get(i + 1).map(|x| x.0).unwrap_or(lines.len());
        let content = lines[line + 1..end].join("\n").trim().to_string();
        result.push((
            title.clone(),
            if content.is_empty() {
                title.clone()
            } else {
                content
            },
        ));
    }
    result
}

fn book_id(path: &Path, size: u64, modified: u64) -> String {
    format!("local://{}:{}:{}", path.to_string_lossy(), size, modified)
}
fn modified(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn load_books(conn: &Connection) -> Result<Vec<BookItem>> {
    let mut stmt = conn.prepare("SELECT id,name,author,chapter_count,current_chapter FROM books ORDER BY updated_at DESC, sort_order DESC")?;
    let rows = stmt.query_map([], |r| {
        let current: i32 = r.get(4)?;
        let count: i32 = r.get(3)?;
        Ok(BookItem {
            id: r.get::<_, String>(0)?.into(),
            title: r.get::<_, String>(1)?.into(),
            author: r.get::<_, String>(2)?.into(),
            chapters: count,
            progress: (if count == 0 {
                "未开始".into()
            } else {
                format!("阅读到第 {} 章", current + 1)
            })
            .into(),
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn load_books_matching(conn: &Connection, query: &str) -> Result<Vec<BookItem>> {
    let q = query.trim().to_lowercase();
    Ok(load_books(conn)?
        .into_iter()
        .filter(|book| {
            q.is_empty()
                || book.title.to_string().to_lowercase().contains(&q)
                || book.author.to_string().to_lowercase().contains(&q)
        })
        .collect())
}

fn set_books(ui: &MainWindow, conn: &Connection) -> Result<()> {
    ui.set_books(ModelRc::new(VecModel::from(load_books(conn)?)));
    Ok(())
}
fn set_recent(ui: &MainWindow, conn: &Connection) -> Result<()> {
    let recent: Option<(String, String)> = conn
        .query_row(
            "SELECT id,name FROM books ORDER BY updated_at DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((id, name)) = recent {
        ui.set_recent_book_id(id.into());
        ui.set_recent_book_title(name.into());
    } else {
        ui.set_recent_book_id("".into());
        ui.set_recent_book_title("".into());
    }
    Ok(())
}
fn settings(conn: &Connection) -> Settings {
    conn.query_row("SELECT value FROM settings WHERE key='reader'", [], |r| {
        r.get::<_, String>(0)
    })
    .ok()
    .and_then(|v| serde_json::from_str(&v).ok())
    .unwrap_or_default()
}
fn save_settings(conn: &Connection, value: &Settings) -> Result<()> {
    conn.execute("INSERT INTO settings(key,value) VALUES ('reader',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [serde_json::to_string(value)?])?;
    Ok(())
}
fn filters(conn: &Connection, book: &str) -> Result<Vec<FilterItem>> {
    let mut stmt = conn.prepare("SELECT id,search,replacement FROM filters WHERE book_id=?")?;
    let items = stmt
        .query_map([book], |r| {
            Ok(FilterItem {
                id: r.get(0)?,
                search: r.get::<_, String>(1)?.into(),
                replacement: r.get::<_, String>(2)?.into(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

fn show_book(ui: &MainWindow, state: &AppState, id: &str) -> Result<()> {
    let conn = state.db.lock().unwrap();
    let (title, author, current): (String, String, i32) = conn.query_row(
        "SELECT name,author,current_chapter FROM books WHERE id=?",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let mut stmt = conn.prepare(
        "SELECT chapter_index,title FROM chapters WHERE book_id=? ORDER BY chapter_index",
    )?;
    let list: Vec<ChapterItem> = stmt
        .query_map([id], |r| {
            Ok(ChapterItem {
                index: r.get(0)?,
                title: r.get::<_, String>(1)?.into(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    state.current_book.lock().unwrap().replace(id.to_string());
    *state.current_chapter.lock().unwrap() = current;
    let filter_items = filters(&conn, id)?;
    drop(conn);
    ui.set_page(1);
    ui.set_selected_book_title(title.into());
    ui.set_selected_book_author(author.into());
    ui.set_chapters(ModelRc::new(VecModel::from(list)));
    ui.set_filters(ModelRc::new(VecModel::from(filter_items)));
    load_chapter(ui, state, current)?;
    Ok(())
}

fn load_chapter(ui: &MainWindow, state: &AppState, index: i32) -> Result<()> {
    let id = state
        .current_book
        .lock()
        .unwrap()
        .clone()
        .context("没有打开的书籍")?;
    let conn = state.db.lock().unwrap();
    let (title, mut content): (String, String) = conn.query_row(
        "SELECT title,content FROM chapters WHERE book_id=? AND chapter_index=?",
        params![id, index],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let mut stmt = conn.prepare("SELECT search,replacement FROM filters WHERE book_id=?")?;
    for row in stmt.query_map([&id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })? {
        let (search, replacement) = row?;
        if !search.is_empty() {
            content = content.replace(&search, &replacement);
        }
    }
    let count: i32 = conn.query_row("SELECT chapter_count FROM books WHERE id=?", [&id], |r| {
        r.get(0)
    })?;
    conn.execute(
        "UPDATE books SET current_chapter=?,updated_at=? WHERE id=?",
        params![index, Utc::now().timestamp(), id],
    )?;
    *state.current_chapter.lock().unwrap() = index;
    set_recent(ui, &conn)?;
    ui.set_selected_chapter_title(title.into());
    ui.set_chapter_content(content.into());
    ui.set_status(format!("第 {} / {} 章", index + 1, count).into());
    Ok(())
}

fn import_file(ui: &MainWindow, state: &AppState) -> Result<()> {
    let paths = rfd::FileDialog::new()
        .add_filter("TXT 文本", &["txt"])
        .pick_files()
        .unwrap_or_default();
    import_paths(ui, state, paths)
}

fn import_paths(ui: &MainWindow, state: &AppState, paths: Vec<std::path::PathBuf>) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let conn = state.db.lock().unwrap();
    let now = Utc::now().timestamp();
    let mut imported = 0;
    for path in paths {
        let meta = fs::metadata(&path)?;
        let id = book_id(&path, meta.len(), modified(&path));
        let text = decode_text(&fs::read(&path)?);
        let chapters = split_chapters(&text);
        let name = path
            .file_stem()
            .and_then(|x| x.to_str())
            .unwrap_or("未命名")
            .to_string();
        conn.execute("INSERT INTO books(id,name,author,source_path,imported_at,updated_at,chapter_count,current_chapter,current_pos,sort_order) VALUES (?,?,?,?,?,?,?,0,0,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,chapter_count=excluded.chapter_count", params![id, name, "本地导入", path.to_string_lossy(), now, now, chapters.len() as i32, now])?;
        conn.execute("DELETE FROM chapters WHERE book_id=?", [&id])?;
        let tx = conn.unchecked_transaction()?;
        for (index, (title, content)) in chapters.iter().enumerate() {
            tx.execute(
                "INSERT INTO chapters(book_id,chapter_index,title,content) VALUES (?,?,?,?)",
                params![id, index as i32, title, content],
            )?;
        }
        tx.commit()?;
        imported += 1;
    }
    set_books(ui, &conn)?;
    set_recent(ui, &conn)?;
    ui.set_status(format!("已导入 {} 本 TXT", imported).into());
    Ok(())
}

fn main() -> Result<()> {
    let ui = MainWindow::new()?;
    ui.on_transfer_to_paths(|transfer| {
        let paths = transfer
            .file_paths()
            .ok()
            .into_iter()
            .flatten()
            .map(|path| path.to_string_lossy().to_string().into())
            .collect::<Vec<_>>();
        ModelRc::new(VecModel::from(paths))
    });
    let conn = open_db()?;
    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        current_book: Arc::new(Mutex::new(None)),
        current_chapter: Arc::new(Mutex::new(0)),
    };
    let s = state.clone();
    {
        let c = s.db.lock().unwrap();
        set_books(&ui, &c)?;
        set_recent(&ui, &c)?;
        let cfg = settings(&c);
        ui.set_theme(cfg.theme);
        ui.set_font(cfg.font);
        ui.set_font_size(cfg.font_size);
        ui.set_line_spacing(cfg.line_spacing);
        ui.set_paragraph_spacing(cfg.paragraph_spacing);
        ui.set_letter_spacing_value(cfg.letter_spacing);
        ui.set_read_width(cfg.read_width);
        ui.set_jump_duration(cfg.jump_duration);
        ui.set_infinite_loading(cfg.infinite_loading);
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_import_clicked(move || {
            if let Some(w) = w.upgrade() {
                if let Err(e) = import_file(&w, &s) {
                    w.set_status(format!("导入失败：{e}").into());
                }
            }
        });
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_files_dropped(move |files| {
            if let Some(w) = w.upgrade() {
                let paths = files
                    .iter()
                    .filter_map(|file| {
                        let path = std::path::PathBuf::from(file.as_str());
                        let is_txt = path
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .filter(|ext| ext.eq_ignore_ascii_case("txt"))
                            .is_some();
                        is_txt.then_some(path)
                    })
                    .collect();
                if let Err(e) = import_paths(&w, &s, paths) {
                    w.set_status(format!("拖拽导入失败：{e}").into());
                }
            }
        });
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_book_clicked(move |id| {
            if let Some(w) = w.upgrade() {
                if let Err(e) = show_book(&w, &s, id.as_str()) {
                    w.set_status(format!("打开失败：{e}").into());
                }
            }
        });
    }
    {
        let s = state.clone();
        let chapter_state = s.clone();
        let w = ui.as_weak();
        ui.on_chapter_clicked(move |i| {
            if let Some(w) = w.upgrade() {
                let _ = load_chapter(&w, &chapter_state, i);
            }
        });
        ui.on_previous_clicked({
            let s = s.clone();
            let w = ui.as_weak();
            move || {
                if let Some(w) = w.upgrade() {
                    let i = *s.current_chapter.lock().unwrap();
                    if i > 0 {
                        let _ = load_chapter(&w, &s, i - 1);
                    }
                }
            }
        });
        ui.on_next_clicked({
            let s = s.clone();
            let w = ui.as_weak();
            move || {
                if let Some(w) = w.upgrade() {
                    let i = *s.current_chapter.lock().unwrap();
                    let conn = s.db.lock().unwrap();
                    let count: i32 = conn
                        .query_row(
                            "SELECT chapter_count FROM books WHERE id=?",
                            [s.current_book.lock().unwrap().clone().unwrap_or_default()],
                            |r| r.get(0),
                        )
                        .unwrap_or(0);
                    drop(conn);
                    if i + 1 < count {
                        let _ = load_chapter(&w, &s, i + 1);
                    }
                }
            }
        });
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_book_delete(move |id| {
            if let Some(w) = w.upgrade() {
                let c = s.db.lock().unwrap();
                let _ = c.execute("DELETE FROM books WHERE id=?", [id.as_str()]);
                let _ = set_books(&w, &c);
                let _ = set_recent(&w, &c);
            }
        });
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_clear_clicked(move || {
            if let Some(w) = w.upgrade() {
                let c = s.db.lock().unwrap();
                let _ = c
                    .execute_batch("DELETE FROM books; DELETE FROM filters; DELETE FROM settings;");
                let _ = set_books(&w, &c);
                let _ = set_recent(&w, &c);
                w.set_page(0);
                w.set_settings_open(false);
                w.set_filters_open(false);
                w.set_theme(0);
                w.set_font(4);
                w.set_font_size(18);
                w.set_line_spacing(0.8);
                w.set_paragraph_spacing(1.0);
                w.set_letter_spacing_value(0.0);
                w.set_read_width(800);
                w.set_jump_duration(1000);
                w.set_infinite_loading(false);
                w.set_status("本地数据已清空".into());
            }
        });
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_search_changed(move |query| {
            if let Some(w) = w.upgrade() {
                let c = s.db.lock().unwrap();
                if let Ok(list) = load_books_matching(&c, query.as_str()) {
                    w.set_books(ModelRc::new(VecModel::from(list)));
                }
            }
        });
    }
    {
        let s = state.clone();
        let shelf_w = ui.as_weak();
        ui.on_shelf_clicked(move || {
            if let Some(w) = shelf_w.upgrade() {
                w.set_page(0);
            }
        });
        let recent_s = s.clone();
        let recent_w = ui.as_weak();
        ui.on_recent_clicked(move |id| {
            if let Some(w) = recent_w.upgrade() {
                if !id.is_empty() {
                    let _ = show_book(&w, &recent_s, id.as_str());
                }
            }
        });
        ui.on_settings_clicked({
            let w = ui.as_weak();
            move || {
                if let Some(w) = w.upgrade() {
                    w.set_settings_open(true);
                    w.set_filters_open(false);
                }
            }
        });
        ui.on_filters_clicked({
            let w = ui.as_weak();
            move || {
                if let Some(w) = w.upgrade() {
                    w.set_filters_open(true);
                    w.set_settings_open(false);
                }
            }
        });
        ui.on_close_panel({
            let w = ui.as_weak();
            move || {
                if let Some(w) = w.upgrade() {
                    w.set_settings_open(false);
                    w.set_filters_open(false);
                }
            }
        });
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_add_filter(move |search, replacement| {
            if search.trim().is_empty() {
                return;
            }
            if let Some(w) = w.upgrade() {
                if let Some(id) = s.current_book.lock().unwrap().clone() {
                    let c = s.db.lock().unwrap();
                    let _ = c.execute(
                        "INSERT INTO filters(book_id,search,replacement) VALUES (?,?,?)",
                        params![id, search.as_str(), replacement.as_str()],
                    );
                    if let Ok(list) = filters(&c, &id) {
                        w.set_filters(ModelRc::new(VecModel::from(list)));
                    }
                }
            }
        });
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_remove_filter(move |id| {
            if let Some(w) = w.upgrade() {
                let c = s.db.lock().unwrap();
                let _ = c.execute("DELETE FROM filters WHERE id=?", [id]);
                if let Some(book) = s.current_book.lock().unwrap().clone() {
                    if let Ok(list) = filters(&c, &book) {
                        w.set_filters(ModelRc::new(VecModel::from(list)));
                    }
                }
            }
        });
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_save_settings(move |theme, font_size, read_width, line, paragraph, font| {
            if let Some(w) = w.upgrade() {
                let c = s.db.lock().unwrap();
                let mut cfg = settings(&c);
                cfg.theme = theme.clamp(0, 6);
                cfg.font = font.clamp(0, 4);
                cfg.font_size = font_size.clamp(12, 48);
                cfg.line_spacing = line.clamp(0.2, 2.0);
                cfg.paragraph_spacing = paragraph.clamp(0.0, 4.0);
                cfg.read_width = read_width.clamp(620, 1100);
                let _ = save_settings(&c, &cfg);
                w.set_theme(cfg.theme);
                w.set_font(cfg.font);
                w.set_font_size(cfg.font_size);
                w.set_line_spacing(cfg.line_spacing);
                w.set_paragraph_spacing(cfg.paragraph_spacing);
                w.set_read_width(cfg.read_width);
            }
        });
    }
    {
        let s = state.clone();
        let w = ui.as_weak();
        ui.on_save_advanced_settings(move |letter, jump, infinite| {
            if let Some(w) = w.upgrade() {
                let c = s.db.lock().unwrap();
                let mut cfg = settings(&c);
                cfg.letter_spacing = letter.clamp(-1.0, 2.0);
                cfg.jump_duration = jump.clamp(0, 10000);
                cfg.infinite_loading = infinite;
                let _ = save_settings(&c, &cfg);
                w.set_letter_spacing_value(cfg.letter_spacing);
                w.set_jump_duration(cfg.jump_duration);
                w.set_infinite_loading(cfg.infinite_loading);
            }
        });
    }
    ui.run()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{chapter_line, split_chapters};

    #[test]
    fn recognizes_common_chapter_titles() {
        assert!(chapter_line("第一章 初见"));
        assert!(chapter_line("Chapter 12"));
        assert!(chapter_line("番外：归途"));
        assert!(!chapter_line("这是一段普通正文，内容比较长。"));
    }

    #[test]
    fn splits_titled_text_and_keeps_preface() {
        let chapters = split_chapters("作者序\n说明\n\n第一章 开始\n甲\n\n第二章 继续\n乙");
        assert_eq!(chapters.len(), 3);
        assert_eq!(chapters[0].0, "前言");
        assert_eq!(chapters[1].0, "第一章 开始");
        assert_eq!(chapters[2].1, "乙");
    }

    #[test]
    fn chunks_untitled_text() {
        let text = "第一段\n\n第二段";
        let chapters = split_chapters(text);
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].0, "正文");
    }
}
