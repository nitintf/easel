use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasMeta {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Return type for get_canvas_state command (populated from .easel file, not DB)
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasState {
    pub canvas_id: String,
    pub canvas_json: String,
    pub zoom: f64,
    pub viewport_transform: String,
    pub theme_json: Option<String>,
    pub updated_at: String,
}

pub fn list_canvases(conn: &Connection) -> Result<Vec<CanvasMeta>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, sort_order, created_at, updated_at FROM canvases ORDER BY sort_order, created_at"
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(CanvasMeta {
            id: row.get(0)?,
            name: row.get(1)?,
            sort_order: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;

    rows.collect()
}

pub fn create_canvas(conn: &Connection, id: &str, name: &str, sort_order: i32) -> Result<CanvasMeta, rusqlite::Error> {
    conn.execute(
        "INSERT INTO canvases (id, name, sort_order) VALUES (?1, ?2, ?3)",
        params![id, name, sort_order],
    )?;

    conn.query_row(
        "SELECT id, name, sort_order, created_at, updated_at FROM canvases WHERE id = ?1",
        params![id],
        |row| {
            Ok(CanvasMeta {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
}

pub fn rename_canvas(conn: &Connection, id: &str, name: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE canvases SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![name, id],
    )?;
    Ok(())
}

pub fn delete_canvas(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM canvases WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn canvas_exists(conn: &Connection, id: &str) -> Result<bool, rusqlite::Error> {
    conn.query_row(
        "SELECT COUNT(*) > 0 FROM canvases WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )
}

pub fn create_canvas_with_timestamps(
    conn: &Connection,
    id: &str,
    name: &str,
    sort_order: i32,
    created_at: &str,
    updated_at: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO canvases (id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, sort_order, created_at, updated_at],
    )?;
    Ok(())
}

pub fn get_canvas_name(conn: &Connection, id: &str) -> Result<Option<String>, rusqlite::Error> {
    let result = conn.query_row(
        "SELECT name FROM canvases WHERE id = ?1",
        params![id],
        |row| row.get(0),
    );

    match result {
        Ok(name) => Ok(Some(name)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn update_canvas_timestamp(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE canvases SET updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}
