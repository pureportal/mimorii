use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

static TEMPORARY_PATH_ID: AtomicUsize = AtomicUsize::new(0);

pub struct MockResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
    delay: Duration,
}

impl MockResponse {
    pub fn new(status: u16, body: impl Into<String>) -> Self {
        Self {
            status,
            headers: Vec::new(),
            body: body.into(),
            delay: Duration::ZERO,
        }
    }

    pub fn header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }

    pub fn delayed(mut self, duration: Duration) -> Self {
        self.delay = duration;
        self
    }
}

pub struct MockServer {
    pub url: String,
    pub requests: Receiver<String>,
}

pub fn http_server(responses: Vec<MockResponse>) -> MockServer {
    let listener = TcpListener::bind("127.0.0.1:0").expect("HTTP fixture should bind");
    let address = listener
        .local_addr()
        .expect("HTTP fixture should have an address");
    let (sender, requests) = mpsc::channel();
    thread::spawn(move || {
        for response in responses {
            let (mut stream, _) = listener
                .accept()
                .expect("HTTP fixture should accept a request");
            let request = read_request(&mut stream);
            sender
                .send(request)
                .expect("request receiver should remain open");
            thread::sleep(response.delay);
            let reason = match response.status {
                200 => "OK",
                201 => "Created",
                204 => "No Content",
                301 => "Moved Permanently",
                302 => "Found",
                400 => "Bad Request",
                401 => "Unauthorized",
                404 => "Not Found",
                500 => "Internal Server Error",
                _ => "Response",
            };
            let mut headers = response
                .headers
                .iter()
                .map(|(name, value)| format!("{name}: {value}\r\n"))
                .collect::<String>();
            headers.push_str(&format!("Content-Length: {}\r\n", response.body.len()));
            headers.push_str("Connection: close\r\n");
            let payload = format!(
                "HTTP/1.1 {} {}\r\n{}\r\n{}",
                response.status, reason, headers, response.body
            );
            let _ = stream.write_all(payload.as_bytes());
        }
    });
    MockServer {
        url: format!("http://{address}"),
        requests,
    }
}

pub fn tcp_listener() -> (TcpListener, u16) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("TCP fixture should bind");
    let port = listener
        .local_addr()
        .expect("TCP fixture should have an address")
        .port();
    (listener, port)
}

pub fn temporary_path(name: &str) -> std::path::PathBuf {
    let id = TEMPORARY_PATH_ID.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir()
        .join(format!("mimorii-agent-desktop-{}-{id}", std::process::id()))
        .join(name)
}

fn read_request(stream: &mut TcpStream) -> String {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .expect("fixture timeout should be set");
    let mut request = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        let count = stream.read(&mut buffer).unwrap_or(0);
        if count == 0 {
            break;
        }
        request.extend_from_slice(&buffer[..count]);
        if let Some(header_end) = find_header_end(&request) {
            let content_length = content_length(&request[..header_end]);
            if request.len() >= header_end + 4 + content_length {
                break;
            }
        }
    }
    String::from_utf8(request).expect("HTTP request should be UTF-8")
}

fn find_header_end(value: &[u8]) -> Option<usize> {
    value.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_length(headers: &[u8]) -> usize {
    String::from_utf8_lossy(headers)
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse().ok())
                .flatten()
        })
        .unwrap_or(0)
}
