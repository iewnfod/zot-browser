use std::rc::Rc;

use gpui::{div, prelude::FluentBuilder, ElementId, IntoElement, ParentElement, RenderOnce, SharedString, SharedUri, Styled, Task};
use gpui_component::{button::{Button, ButtonVariants}, h_flex, list::{ListDelegate, ListItem}, ActiveTheme, Disableable, Icon, IconName, IndexPath, Selectable};

#[derive(Clone)]
pub enum SearchIcon {
	Name(IconName),
	Custom(SharedString)
}

impl Default for SearchIcon {
	fn default() -> Self {
		Self::Name(IconName::Search)
	}
}

impl PartialEq for SearchIcon {
	fn eq(&self, other: &Self) -> bool {
		match (self, other) {
			(SearchIcon::Name(n1), SearchIcon::Name(n2)) => n1.clone().path() == n2.clone().path(),
			(SearchIcon::Custom(n1), SearchIcon::Custom(n2)) => n1 == n2,
			_ => false
		}
	}
}

#[derive(Default, Clone, PartialEq)]
pub struct SearchInfo {
	pub icon: SearchIcon,
	pub name: Option<SharedString>,
	pub uri: SharedUri,
	pub description: Option<SharedString>,
}

#[derive(IntoElement)]
pub struct SearchListItem {
	base: ListItem,
	ix: IndexPath,
	info: SearchInfo,
	selected: bool
}

impl SearchListItem {
	pub fn new(
		id: impl Into<ElementId>,
		info: SearchInfo,
		ix: IndexPath,
		selected: bool
	) -> Self {
		SearchListItem {
			base: ListItem::new(id),
			ix,
			info,
			selected
		}
	}

	fn get_name(&self) -> SharedString {
		if let Some(name) = self.info.name.clone() {
			name
		} else {
			if let Some(desc) = self.info.description.clone() {
				desc
			} else {
				SharedString::new(self.info.uri.clone().to_string())
			}
		}
	}

	fn get_desc(&self) -> SharedString {
		if let Some(desc) = self.info.description.clone() {
			desc
		} else {
			SharedString::new(self.info.uri.clone().to_string())
		}
	}
}

impl Selectable for SearchListItem {
	fn selected(mut self, selected: bool) -> Self {
		self.selected = selected;
		self
	}

	fn is_selected(&self) -> bool {
		self.selected
	}
}

impl RenderOnce for SearchListItem {
	fn render(self, _window: &mut gpui::Window, cx: &mut gpui::App) -> impl IntoElement {
		let text_color = if self.selected {
			cx.theme().accent_foreground
		} else {
			cx.theme().foreground
		};

		let bg_color = if self.selected {
			cx.theme().list_active
		} else {
			cx.theme().list
		};

		let name = self.get_name();
		let desc = self.get_desc();
		let icon_bt_id = format!("search-list-item-{}-icon-bt", &self.ix.row);

		self.base
			.px_2()
			.py_1()
			.bg(bg_color)
			.mt_2()
			.when(self.selected, |this| {
				this.border_color(cx.theme().selection)
			})
			.rounded_md()
			.child(
				h_flex()
					.gap_2()
					.items_center()
					.child(
						Button::new(SharedString::new(icon_bt_id))
							.text()
							.pl_2()
							.pr_0()
							.icon(
								match self.info.icon {
									SearchIcon::Name(icon) => Icon::new(icon),
									SearchIcon::Custom(icon) => Icon::empty().path(icon)
								}
							)
							.disabled(true)
					)
					.child(
						div()
							.text_color(text_color)
							.child(name)
					)
					.when(self.selected, |this| {
						this
							.child("--")
							.child(desc)
					})
			)
	}
}

pub struct SearchListDelegate {
	items: Vec<SearchInfo>,
	selected_index: Option<IndexPath>,
	loading: bool,
}

impl SearchListDelegate {
	pub fn selected_item(&self) -> Option<Rc<SearchInfo>> {
		let Some(ix) = self.selected_index else {
			return None;
		};

		if let Some(info) = self.items.get(ix.row) {
			Some(Rc::new(info.clone()))
		} else {
			None
		}
	}

	pub fn set_items(&mut self, new_items: Vec<SearchInfo>) {
		let items: Vec<SearchInfo> = new_items.iter().filter_map(|item| if item.uri.is_empty() {None} else {Some(item.clone())}).collect();
		if self.items != items {
			self.items = items;
		}
	}
}

impl ListDelegate for SearchListDelegate {
	type Item = SearchListItem;

	fn items_count(&self, _section: usize, _cx: &gpui::App) -> usize {
		self.items.len()
	}

	fn set_selected_index(
		&mut self,
		ix: Option<IndexPath>,
		_window: &mut gpui::Window,
		cx: &mut gpui::Context<gpui_component::list::List<Self>>,
	) {
		self.selected_index = ix;
		cx.notify();
	}

	fn render_item(
		&self,
		ix: IndexPath,
		_window: &mut gpui::Window,
		_cx: &mut gpui::Context<gpui_component::list::List<Self>>,
	) -> Option<Self::Item> {
		let selected = Some(ix) == self.selected_index;
		if let Some(item) = self.items.get(ix.row) {
			return Some(
				SearchListItem::new(ix, item.clone(), ix, selected)
			);
		}
		None
	}

	fn loading(&self, _cx: &gpui::App) -> bool {
		self.loading
	}

	fn render_empty(&self, _window: &mut gpui::Window, _cx: &mut gpui::Context<gpui_component::list::List<Self>>) -> impl IntoElement {
		div()
	}

	fn cancel(&mut self, _window: &mut gpui::Window, _cx: &mut gpui::Context<gpui_component::list::List<Self>>) {
		self.selected_index = Some(IndexPath::default());
	}
}

impl Default for SearchListDelegate {
	fn default() -> Self {
		Self {
			items: vec![],
			selected_index: Some(IndexPath::default()),
			loading: false
		}
	}
}
