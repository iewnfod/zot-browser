use gpui::{prelude::*, *};
use gpui_component::{
    button::Button, h_flex, input::{InputEvent, InputState, TextInput}, resizable::{h_resizable, resizable_panel, ResizableState}, sidebar::{Sidebar, SidebarGroup, SidebarMenu, SidebarMenuItem}, v_flex, webview::WebView, wry::WebViewBuilder, ActiveTheme as _, IconName, Selectable
};
use story::*;

pub struct Zot {
    tabs: Vec<Entity<WebView>>,
    active_index: Option<usize>,
    url_input: Entity<InputState>,
    sidebar_state: Entity<ResizableState>,
    show_new_tab_modal: bool,
    webview: Entity<WebView>,
    _subscriptions: Vec<Subscription>,
}

impl Zot {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let url_input = cx.new(|cx| InputState::new(window, cx));

        let webview = cx.new(|cx| {
            let builder = WebViewBuilder::new();
            #[cfg(not(any(
                target_os = "windows",
                target_os = "macos",
                target_os = "ios",
                target_os = "android"
            )))]
            let webview = {
                use gtk::prelude::*;
                use wry::WebViewBuilderExtUnix;
                // borrowed from https://github.com/tauri-apps/wry/blob/dev/examples/gtk_multiwebview.rs
                // doesn't work yet
                // TODO: How to initialize this fixed?
                let fixed = gtk::Fixed::builder().build();
                fixed.show_all();
                builder.build_gtk(&fixed).unwrap()
            };
            #[cfg(any(
                target_os = "windows",
                target_os = "macos",
                target_os = "ios",
                target_os = "android"
            ))]
            let webview = {
                use raw_window_handle::HasWindowHandle;

                let window_handle = window.window_handle().expect("No window handle");
                builder.build_as_child(&window_handle).unwrap()
            };

            WebView::new(webview, window, cx)
        });

        let _subscriptions = vec![
            cx.subscribe(
                &url_input,
                |this: &mut Self, input, e: &InputEvent, cx| match e {
                    InputEvent::PressEnter { .. } => {
                        let url = input.read(cx).value().clone();
                        if let Some(index) = this.active_index {
                            println!("Change Tab Url");
                            if let Some(tab) = this.tabs.get(index) {
                                tab.update(cx, |view, _| {
                                    view.load_url(&url);
                                });
                            }
                        } else {
                            println!("New Tab");
                            let tab = this.webview.clone();
                            tab.update(cx, |tab, _cx| {
                                tab.load_url(&url);
                            });
                            this.tabs.push(tab);
                            this.active_index = Some(this.tabs.len() - 1);
                        }
                    },
                    _ => {}
                }
            )
        ];

        let tabs = vec![];

        let this = Self {
            url_input,
            tabs,
            active_index: None,
            sidebar_state: ResizableState::new(cx),
            show_new_tab_modal: false,
            webview,
            _subscriptions,
        };

        this
    }

    fn view(window: &mut Window, cx: &mut App) -> Entity<Self> {
        cx.new(|cx| Self::new(window, cx))
    }

    fn to_index(&mut self, index: usize, window: &mut Window, cx: &mut Context<Self>) {
        self.active_index = Some(index);
        if let Some(tab) = self.tabs.get(index) {
            if let Ok(url) = tab.read(cx).url() {
                self.url_input.update(cx, |input, cx| {
                    input.set_value(url, window, cx);
                });
            }
        }
    }
}

impl Render for Zot {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut active_tab = None;
        if let Some(index) = self.active_index {
            active_tab = self.tabs.get(index);
        }

        h_resizable("gallery-container", self.sidebar_state.clone())
            .child(
                resizable_panel()
                    .size(px(255.))
                    .size_range(px(200.)..px(320.))
                    .child(
                        Sidebar::left()
                            .width(relative(1.))
                            .border_width(px(0.))
                            .header(
                                v_flex()
                                    .w_full()
                                    .gap_3()
                                    .child(
                                        div()
                                            .bg(cx.theme().sidebar_accent)
                                            .flex_1()
                                            .p_1()
                                            .pl_0()
                                            .pr_0()
                                            .rounded_md()
                                            .text_sm()
                                            .h_8()
                                            .child(
                                                h_flex()
                                                    .w_full()
                                                    .h_full()
                                                    .items_center()
                                                    .justify_center()
                                                    .child(
                                                        TextInput::new(&self.url_input)
                                                            .appearance(false)
                                                            .h_8()
                                                    )
                                            ),
                                    ),
                            )
                            .child(
                                SidebarGroup::new("Tabs").child(
                                    SidebarMenu::new().children(
                                        self.tabs.clone().into_iter().enumerate().map(
                                            |(index, _tab)| {
                                                SidebarMenuItem::new(format!("Tab {}", index + 1))
                                                    .active(
                                                        self.active_index == Some(index),
                                                    )
                                                    .on_click(
                                                        cx.listener(
                                                            move |this, _e: &ClickEvent, window, cx| {
                                                                this.to_index(index, window, cx);
                                                                cx.notify();
                                                            }
                                                        )
                                                    )
                                            }
                                        )
                                    )
                                )
                            )
                            .footer(
                                Button::new("new-tab")
                                    .icon(IconName::Plus)
                                    .label("New Tab")
                                    .w_full()
                                    .h_10()
                                    .outline()
                                    .secondary_selected(true)
                                    .on_click(
                                        cx.listener(
                                            move |this, _: &ClickEvent, window, cx| {
                                                this.active_index = None;
                                                this.url_input.update(cx, |input, cx| {
                                                    input.set_value("", window, cx);
                                                });
                                                cx.notify();
                                            }
                                        )
                                    )
                            )
                    ),
            )
            .child(
            div()
                    .id("tab-container")
                    .w_full()
                    .h_full()
                    .when_some(active_tab, |this, tab| {
                        this.child(tab.clone())
                    })
                    .into_any_element()
            )
    }
}

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
