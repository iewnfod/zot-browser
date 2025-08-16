use regex::Regex;

pub fn is_uri<T: ToString>(uri: T) -> bool {
	let re = Regex::new(r"(https?|ftp|file)://[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]").unwrap();
	let u = uri.to_string();
	re.is_match(&u)
}

pub fn uri_search_with_google<T: ToString>(uri: T) -> String {
	let u = uri.to_string();
	let mut s = String::from("https://www.google.com/search?q=");
	s.push_str(&u);
	s
}
