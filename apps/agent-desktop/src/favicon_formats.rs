pub(super) fn looks_like_image(body: &[u8], content_type: Option<&str>) -> bool {
    body.starts_with(b"\x89PNG\r\n\x1a\n")
        || body.starts_with(b"\xff\xd8\xff")
        || body.starts_with(b"GIF87a")
        || body.starts_with(b"GIF89a")
        || (body.starts_with(b"RIFF") && body.get(8..12) == Some(b"WEBP"))
        || body.starts_with(b"\x00\x00\x01\x00")
        || looks_like_avif(body)
        || looks_like_svg(body, content_type)
}

fn looks_like_avif(body: &[u8]) -> bool {
    if body.len() < 16 || body.get(4..8) != Some(b"ftyp") {
        return false;
    }
    let box_size = u32::from_be_bytes(body[..4].try_into().unwrap()) as usize;
    if box_size < 16 || box_size > body.len() || box_size % 4 != 0 {
        return false;
    }
    std::iter::once(&body[8..12])
        .chain(body[16..box_size].chunks_exact(4))
        .any(|brand| brand == b"avif" || brand == b"avis")
}

fn looks_like_svg(body: &[u8], content_type: Option<&str>) -> bool {
    let content_type_is_svg = content_type.is_some_and(|value| {
        let value = value.to_ascii_lowercase();
        value.starts_with("image/svg+xml") || value.starts_with("application/svg+xml")
    });
    let text_prefix = String::from_utf8_lossy(&body[..body.len().min(4_096)]);
    let text_prefix = text_prefix
        .trim_start_matches(|character: char| character.is_whitespace() || character == '\u{feff}')
        .to_ascii_lowercase();
    let svg = text_prefix.starts_with("<svg")
        || (["<?xml", "<!--", "<!doctype svg"]
            .into_iter()
            .any(|prefix| text_prefix.starts_with(prefix))
            && text_prefix.contains("<svg"));
    svg || (content_type_is_svg && text_prefix.contains("<svg"))
}
