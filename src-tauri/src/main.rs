#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalTextFile {
    path: String,
    name: String,
    size: u64,
    last_modified: u64,
    bytes: Vec<u8>,
}

fn app_data_directory() -> Result<PathBuf, String> {
    Ok(app_directory()?.join("data"))
}

fn app_directory() -> Result<PathBuf, String> {
    let executable =
        std::env::current_exe().map_err(|error| format!("获取程序路径失败：{error}"))?;
    executable
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "获取程序目录失败".to_string())
}

fn ensure_data_directory() -> Result<PathBuf, String> {
    let data_directory = app_data_directory()?;
    fs::create_dir_all(data_directory.join("books"))
        .map_err(|error| format!("创建本地数据目录失败：{error}"))?;
    Ok(data_directory)
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let content =
        serde_json::to_vec_pretty(value).map_err(|error| format!("生成本地数据失败：{error}"))?;
    fs::write(path, content).map_err(|error| format!("写入本地数据失败：{error}"))
}

fn read_json(path: &Path) -> Result<Value, String> {
    let content = fs::read(path).map_err(|error| format!("读取本地数据失败：{error}"))?;
    serde_json::from_slice(&content).map_err(|error| format!("解析本地数据失败：{error}"))
}

fn book_storage_id(book_url: &str) -> String {
    // 使用稳定的 FNV-1a 哈希，避免 Windows 文件名和路径长度问题。
    let mut hash = 14695981039346656037_u64;
    for byte in book_url.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("{hash:016x}")
}

fn book_directory(data_directory: &Path, book_url: &str) -> PathBuf {
    data_directory.join("books").join(book_storage_id(book_url))
}

fn modified_millis(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn collect_text_paths(path: &Path, paths: &mut Vec<PathBuf>) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("读取路径失败：{}：{error}", path.display()))?;
    if metadata.is_file() {
        if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("txt"))
        {
            paths.push(path.to_path_buf());
        }
        return Ok(());
    }
    if !metadata.is_dir() {
        return Ok(());
    }

    let entries = fs::read_dir(path)
        .map_err(|error| format!("读取文件夹失败：{}：{error}", path.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取文件夹内容失败：{error}"))?;
        collect_text_paths(&entry.path(), paths)?;
    }
    Ok(())
}

#[tauri::command]
fn get_local_data_directory() -> Result<String, String> {
    ensure_data_directory().map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_local_text_files(paths: Vec<String>) -> Result<Vec<LocalTextFile>, String> {
    let mut discovered = Vec::new();
    for path in paths {
        collect_text_paths(Path::new(&path), &mut discovered)?;
    }

    let mut seen = HashSet::new();
    discovered.retain(|path| seen.insert(path.to_string_lossy().to_lowercase()));
    discovered.sort_by(|left, right| left.to_string_lossy().cmp(&right.to_string_lossy()));

    discovered
        .into_iter()
        .map(|path| {
            let bytes = fs::read(&path)
                .map_err(|error| format!("读取 TXT 失败：{}：{error}", path.display()))?;
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("读取 TXT 信息失败：{}：{error}", path.display()))?;
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| "未命名.txt".to_string());
            Ok(LocalTextFile {
                path: path.to_string_lossy().into_owned(),
                name,
                size: metadata.len(),
                last_modified: modified_millis(&path),
                bytes,
            })
        })
        .collect()
}

#[tauri::command]
fn list_local_books() -> Result<Vec<Value>, String> {
    let data_directory = ensure_data_directory()?;
    let books_directory = data_directory.join("books");
    let mut books = Vec::new();
    for entry in
        fs::read_dir(books_directory).map_err(|error| format!("读取书籍目录失败：{error}"))?
    {
        let entry = entry.map_err(|error| format!("读取书籍目录内容失败：{error}"))?;
        let book_path = entry.path().join("book.json");
        if !book_path.is_file() {
            continue;
        }
        books.push(read_json(&book_path)?);
    }
    Ok(books)
}

#[tauri::command]
fn read_local_book(book_url: String) -> Result<Value, String> {
    let data_directory = ensure_data_directory()?;
    let directory = book_directory(&data_directory, &book_url);
    Ok(json!({
        "book": read_json(&directory.join("book.json"))?,
        "chapters": read_json(&directory.join("chapters.json"))?,
    }))
}

#[tauri::command]
fn save_local_book(book: Value, chapters: Vec<Value>, source: Vec<u8>) -> Result<(), String> {
    let book_url = book
        .get("bookUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| "本地书籍缺少 bookUrl".to_string())?;
    let data_directory = ensure_data_directory()?;
    let directory = book_directory(&data_directory, book_url);
    fs::create_dir_all(&directory).map_err(|error| format!("创建书籍目录失败：{error}"))?;
    write_json(&directory.join("book.json"), &book)?;
    write_json(&directory.join("chapters.json"), &Value::Array(chapters))?;
    fs::write(directory.join("source.txt"), source)
        .map_err(|error| format!("保存原始 TXT 失败：{error}"))
}

#[tauri::command]
fn update_local_book(book: Value) -> Result<(), String> {
    let book_url = book
        .get("bookUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| "本地书籍缺少 bookUrl".to_string())?;
    let data_directory = ensure_data_directory()?;
    let directory = book_directory(&data_directory, book_url);
    if !directory.is_dir() {
        return Err("本地书籍不存在".to_string());
    }
    write_json(&directory.join("book.json"), &book)
}

#[tauri::command]
fn delete_local_book(book_url: String) -> Result<(), String> {
    let data_directory = ensure_data_directory()?;
    let directory = book_directory(&data_directory, &book_url);
    if directory.is_dir() {
        fs::remove_dir_all(directory).map_err(|error| format!("删除书籍数据失败：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn read_local_config() -> Result<Option<Value>, String> {
    let path = ensure_data_directory()?.join("settings.json");
    if !path.is_file() {
        return Ok(None);
    }
    read_json(&path).map(Some)
}

#[tauri::command]
fn write_local_config(config: Value) -> Result<(), String> {
    write_json(&ensure_data_directory()?.join("settings.json"), &config)
}

#[tauri::command]
fn read_local_recent() -> Result<Option<Value>, String> {
    let path = ensure_data_directory()?.join("recent.json");
    if !path.is_file() {
        return Ok(None);
    }
    read_json(&path).map(Some)
}

#[tauri::command]
fn write_local_recent(recent: Option<Value>) -> Result<(), String> {
    let path = ensure_data_directory()?.join("recent.json");
    match recent {
        Some(value) => write_json(&path, &value),
        None => {
            if path.is_file() {
                fs::remove_file(path).map_err(|error| format!("删除最近阅读记录失败：{error}"))?;
            }
            Ok(())
        }
    }
}

#[tauri::command]
fn read_local_filters(book_url: String) -> Result<Vec<Value>, String> {
    let path = book_directory(&ensure_data_directory()?, &book_url).join("filters.json");
    if !path.is_file() {
        return Ok(Vec::new());
    }
    match read_json(&path)? {
        Value::Array(rules) => Ok(rules),
        _ => Err("本地过滤规则格式错误".to_string()),
    }
}

#[tauri::command]
fn write_local_filters(book_url: String, rules: Vec<Value>) -> Result<(), String> {
    let data_directory = ensure_data_directory()?;
    let directory = book_directory(&data_directory, &book_url);
    if !directory.is_dir() {
        return Err("本地书籍不存在".to_string());
    }
    write_json(&directory.join("filters.json"), &Value::Array(rules))
}

#[tauri::command]
fn clear_local_data() -> Result<(), String> {
    let data_directory = app_data_directory()?;
    if data_directory.is_dir() {
        fs::remove_dir_all(&data_directory)
            .map_err(|error| format!("清空本地数据失败：{error}"))?;
    }
    ensure_data_directory().map(|_| ())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_local_data_directory,
            read_local_text_files,
            list_local_books,
            read_local_book,
            save_local_book,
            update_local_book,
            delete_local_book,
            read_local_config,
            write_local_config,
            read_local_recent,
            write_local_recent,
            read_local_filters,
            write_local_filters,
            clear_local_data,
        ])
        .run(tauri::generate_context!())
        .expect("运行本地 TXT 阅读器失败")
}
