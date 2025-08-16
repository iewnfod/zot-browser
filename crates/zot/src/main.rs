use gpui::Application;
use story::Assets;

use crate::zot_app::Zot;

mod zot_app;
mod search;

fn main() {
    let app = Application::new().with_assets(Assets);

    app.run(move |cx| {
        story::init(cx);
        cx.activate(true);

        story::create_new_window(
            "Zot Browser",
            move |window, cx| Zot::view(window, cx),
            cx,
        );
    });
}
