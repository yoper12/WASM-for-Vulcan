use wasm_bindgen::prelude::*;
use sha2::{Sha256, Digest};

#[wasm_bindgen]
pub fn find_single_nonce(base: &str, difficulty: u32) -> String {
    find_nonce_internal(base, difficulty)
}

fn find_nonce_internal(base: &str, target: u32) -> String {
    let mut base_hasher = Sha256::new();
    base_hasher.update(base.as_bytes());

    let mut nonce_buffer = [0u8; 20];
    nonce_buffer[0] = b'1';
    let mut len = 1;

    for _ in 1..1_000_000_000u64 {
        let mut hasher = base_hasher.clone();
        hasher.update(&nonce_buffer[0..len]);

        let result = hasher.finalize();

        let value = ((result[0] as u32) << 24) |
                    ((result[1] as u32) << 16) |
                    ((result[2] as u32) << 8) |
                    (result[3] as u32);

        if value < target {
            return std::str::from_utf8(&nonce_buffer[0..len]).unwrap().to_string();
        }

        let mut i = len;
        let mut carry = true;
        while carry {
            if i == 0 {
                if len < nonce_buffer.len() {
                    for j in (0..len).rev() {
                        nonce_buffer[j+1] = nonce_buffer[j];
                    }
                    nonce_buffer[0] = b'1';
                    nonce_buffer[1] = b'0';
                    len += 1;
                    carry = false;
                } else {
                    return String::new();
                }
            } else {
                i -= 1;
                if nonce_buffer[i] < b'9' {
                    nonce_buffer[i] += 1;
                    carry = false;
                } else {
                    nonce_buffer[i] = b'0';
                }
            }
        }
    }
    String::new()
}
