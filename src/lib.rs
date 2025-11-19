use wasm_bindgen::prelude::*;
use sha2::{Sha256, Digest};
use std::convert::TryInto;
use std::fmt::Write;

#[wasm_bindgen]
pub fn find_single_nonce(base: &str, difficulty: u32) -> String {
    find_nonce_internal(base, difficulty)
}

fn find_nonce_internal(base: &str, target: u32) -> String {
    let mut hasher = Sha256::new();
    let mut buffer = String::with_capacity(base.len() + 20);
    buffer.push_str(base);
    let base_len = buffer.len();

    for nonce in 1..1_000_000_000u64 {
        buffer.truncate(base_len);
        write!(&mut buffer, "{}", nonce).unwrap();

        hasher.update(buffer.as_bytes());
        let result = hasher.finalize_reset();

        let prefix: [u8; 4] = result[0..4].try_into().unwrap();
        let value = u32::from_be_bytes(prefix);

        if value < target {
            return nonce.to_string();
        }
    }
    String::new()
}
