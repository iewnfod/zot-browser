use gpui::{prelude::*, *};
use gpui_component::{
    button::{Button, ButtonVariants}, h_flex, input::{InputEvent, InputState, TextInput}, list::{List, ListEvent}, resizable::{h_resizable, resizable_panel, ResizableState}, sidebar::{Sidebar, SidebarGroup, SidebarMenu, SidebarMenuItem}, v_flex, webview::WebView, wry::WebViewBuilder, ActiveTheme as _, ContextModal, Disableable, IconName, Selectable
};

use crate::search::{SearchInfo, SearchListDelegate};

pub struct Zot {
    focus_handler: FocusHandle,
    tabs: Vec<Entity<WebView>>,
    active_index: Option<usize>,
    url_input: Entity<InputState>,
    sidebar_state: Entity<ResizableState>,
    new_tab_input: Entity<InputState>,
    search_list: Entity<List<SearchListDelegate>>,
    _subscriptions: Vec<Subscription>,
}

impl Zot {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let url_input = cx.new(|cx|
            InputState::new(window, cx).placeholder("Search...")
        );
        let new_tab_input = cx.new(|cx|
            InputState::new(window, cx).placeholder("Search...")
        );

        let search_list_delegate = SearchListDelegate::default();
        let search_list = cx.new(|cx| {
            List::new(search_list_delegate, window, cx)
                .no_query()
                .selectable(true)
                .max_h(px(1000.))
                .scrollbar_visible(false)
        });

        search_list.update(cx, |l, cx| {
            l.set_query_input(new_tab_input.clone(), window, cx);
        });

        let _subscriptions = vec![
            cx.subscribe(
                &search_list,
                |this: &mut Self, delegate: Entity<List<SearchListDelegate>>, e: &ListEvent, cx: &mut Context<Self>| match e {
                    ListEvent::Confirm(_ix) => {
                        let list = delegate.read(cx);
                        if let Some(item) = list.delegate().selected_item() {
                            let uri = item.uri.clone();
                            if let Some(handle) = cx.active_window() {
                                cx.update_window(handle, |_view, window, cx| {
                                    let tab = this.new_webview(
                                        Some(uri.to_string()),
                                        window,
                                        cx
                                    );
                                    this.tabs.push(tab);
                                    this.active_index = Some(this.tabs.len() - 1);

                                    window.close_modal(cx);
                                }).unwrap();
                                cx.notify();
                            }
                        }
                    },
                    _ => {}
                }
            ),
            cx.subscribe(
                &new_tab_input,
                |this: &mut Self, _input, e: &InputEvent, cx| match e {
                    InputEvent::Change(v) => {
                        this.search_list.update(cx, |l: &mut List<SearchListDelegate>, _cx| {
                            let delegate = l.delegate_mut();
                            let mut new_info = SearchInfo::default();
                            new_info.uri = SharedUri::from(v);
                            delegate.set_items(vec![new_info.clone(), new_info.clone(), new_info.clone(), new_info.clone(), new_info.clone()]);
                        });
                        cx.notify();
                    },
                    _ => {}
                }
            )
        ];

        let tabs = vec![];

        let this = Self {
            focus_handler: cx.focus_handle(),
            url_input,
            tabs,
            active_index: None,
            sidebar_state: ResizableState::new(cx),
            new_tab_input,
            search_list,
            _subscriptions,
        };

        this
    }

    pub fn view(window: &mut Window, cx: &mut App) -> Entity<Self> {
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

    fn new_webview(&self, url: Option<String>, window: &mut Window, cx: &mut App) -> Entity<WebView> {
        let webview = cx.new(|cx| {
            let mut builder = WebViewBuilder::new();
            if let Some(url) = url {
                builder = builder.with_url(url);
            }
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

        webview
    }

    fn show_new_tab_modal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let new_tab_input = self.new_tab_input.clone();
        let search_list = self.search_list.clone();

        window.open_modal(cx, move |modal, _window, cx| {
            modal
                .overlay(true)
                .keyboard(true)
                .show_close(false)
                .overlay_closable(true)
                .p_2()
                .gap_0()
                .child(
                    h_flex()
                        .w_full()
                        .items_center()
                        .justify_center()
                        .border_color(cx.theme().border)
                        .border_b_2()
                        .pb_1()
                        .gap_0()
                        .child(
                            Button::new("search-bt")
                                .text()
                                .icon(IconName::Search)
                                .pl_2()
                                .pr_0()
                                .disabled(true)
                        )
                        .child(
                            TextInput::new(&new_tab_input)
                                .appearance(false)
                                .pr_2()
                        )
                )
                .child(
                    div()
                        .flex_1()
                        .w_full()
                        .rounded_md()
                        .min_h_12()
                        .child(search_list.clone())
                )
        });

        self.new_tab_input.focus_handle(cx).focus(window);
        self.new_tab_input.update(cx, |input, cx| {
            input.set_value("", window, cx);
        });
    }
}

impl Render for Zot {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut active_tab = None;
        if let Some(index) = self.active_index {
            active_tab = self.tabs.get(index);
        }

        div()
            .track_focus(&self.focus_handler)
            .size_full()
            .child(
                h_resizable("container", self.sidebar_state.clone())
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
                                                            .gap_0()
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
                                                        this.show_new_tab_modal(window, cx);
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
                            .size_full()
                            .when_some(active_tab, |this, tab| {
                                this.child(tab.clone())
                            })
                            .into_any_element()
                    )
            )
    }
}
