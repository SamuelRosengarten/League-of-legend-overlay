//! Pure window-placement math (physical pixels), kept free of Tauri types so it is unit-testable.

use serde::{Deserialize, Serialize};

pub const MARGIN: i32 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub fn right(&self) -> i32 {
        self.x + self.w
    }
    pub fn bottom(&self) -> i32 {
        self.y + self.h
    }
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }
    /// Squared distance from a point to this rect (0 if inside).
    pub fn distance2(&self, x: i32, y: i32) -> i64 {
        let dx = (self.x - x).max(0).max(x - self.right()) as i64;
        let dy = (self.y - y).max(0).max(y - self.bottom()) as i64;
        dx * dx + dy * dy
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Edge {
    Left,
    Right,
}

/// Index of the work area containing `(x, y)`, or the nearest one.
pub fn pick_monitor(work_areas: &[Rect], x: i32, y: i32) -> Option<usize> {
    work_areas
        .iter()
        .enumerate()
        .min_by_key(|(_, r)| if r.contains(x, y) { -1 } else { r.distance2(x, y) })
        .map(|(i, _)| i)
}

/// Keeps a `w`×`h` window at `(x, y)` fully inside `work` (with margin). If the window is larger
/// than the work area it is pinned to the top-left corner.
pub fn clamp(x: i32, y: i32, w: i32, h: i32, work: Rect) -> (i32, i32) {
    let min_x = work.x + MARGIN;
    let min_y = work.y + MARGIN;
    let max_x = (work.right() - w - MARGIN).max(min_x);
    let max_y = (work.bottom() - h - MARGIN).max(min_y);
    (x.clamp(min_x, max_x), y.clamp(min_y, max_y))
}

/// Nearest vertical screen edge for a window whose left edge is at `x`.
pub fn nearest_edge(x: i32, w: i32, work: Rect) -> Edge {
    let center = x + w / 2;
    if center - work.x < work.right() - center {
        Edge::Left
    } else {
        Edge::Right
    }
}

/// x coordinate for a window docked to `edge`.
pub fn docked_x(edge: Edge, w: i32, work: Rect) -> i32 {
    match edge {
        Edge::Left => work.x + MARGIN,
        Edge::Right => work.right() - w - MARGIN,
    }
}

/// New top-left for a window at `old` resized to `w`×`h` without the user moving it.
///
/// The side closest to a screen edge stays put, so the panel grows away from the corner it
/// lives in: a panel in the bottom half grows upwards, one in the right half grows to the left.
pub fn resize_in_place(old: Rect, w: i32, h: i32, work: Rect) -> (i32, i32) {
    let in_right_half = old.x + old.w / 2 > work.x + work.w / 2;
    let in_bottom_half = old.y + old.h / 2 > work.y + work.h / 2;
    let x = if in_right_half { old.right() - w } else { old.x };
    let y = if in_bottom_half { old.bottom() - h } else { old.y };
    clamp(x, y, w, h, work)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resizes_away_from_the_nearest_corner() {
        // Top-left panel: top-left corner stays.
        let tl = Rect { x: 100, y: 100, w: 320, h: 200 };
        assert_eq!(resize_in_place(tl, 320, 400, MAIN), (100, 100));
        // Bottom-right panel: bottom-right corner stays, so it grows up and left.
        let br = Rect { x: 1500, y: 700, w: 320, h: 200 };
        assert_eq!(resize_in_place(br, 400, 300, MAIN), (1500 + 320 - 400, 700 + 200 - 300));
        // Shrinking keeps the same corner.
        assert_eq!(resize_in_place(br, 320, 100, MAIN), (1500, 800));
        // Growth past the work area is still clamped.
        let low = Rect { x: 100, y: 900, w: 320, h: 100 };
        assert_eq!(resize_in_place(low, 320, 2000, MAIN), (100, MARGIN));
    }

    const MAIN: Rect = Rect { x: 0, y: 0, w: 1920, h: 1040 };
    const SIDE: Rect = Rect { x: 1920, y: 0, w: 2560, h: 1400 };

    #[test]
    fn clamps_inside_work_area() {
        assert_eq!(clamp(-500, -500, 300, 200, MAIN), (MARGIN, MARGIN));
        assert_eq!(clamp(5000, 5000, 300, 200, MAIN), (1920 - 300 - MARGIN, 1040 - 200 - MARGIN));
        assert_eq!(clamp(100, 100, 300, 200, MAIN), (100, 100));
    }

    #[test]
    fn oversized_window_pins_top_left() {
        assert_eq!(clamp(400, 400, 4000, 3000, MAIN), (MARGIN, MARGIN));
    }

    #[test]
    fn picks_containing_or_nearest_monitor() {
        assert_eq!(pick_monitor(&[MAIN, SIDE], 2500, 300), Some(1));
        assert_eq!(pick_monitor(&[MAIN, SIDE], 100, 300), Some(0));
        // Saved position on a monitor that has since been unplugged → nearest one.
        assert_eq!(pick_monitor(&[MAIN], 6000, 300), Some(0));
        assert_eq!(pick_monitor(&[], 0, 0), None);
    }

    #[test]
    fn snaps_to_nearest_edge() {
        assert_eq!(nearest_edge(100, 320, MAIN), Edge::Left);
        assert_eq!(nearest_edge(1500, 320, MAIN), Edge::Right);
        assert_eq!(docked_x(Edge::Right, 320, SIDE), 1920 + 2560 - 320 - MARGIN);
        assert_eq!(docked_x(Edge::Left, 320, SIDE), 1920 + MARGIN);
    }
}
