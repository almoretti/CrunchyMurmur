use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;
use transcribe_rs::onnx::Quantization;
use transcribe_rs::onnx::parakeet::ParakeetModel;
use transcribe_rs::{SpeechModel, TranscribeOptions};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    action: String,
    #[serde(default)]
    model_path: String,
    #[serde(default)]
    audio_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    load_ms: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    inference_ms: Option<u128>,
}

impl Response {
    fn success() -> Self {
        Self {
            ok: true,
            text: None,
            error: None,
            model_path: None,
            load_ms: None,
            inference_ms: None,
        }
    }

    fn failure(error: impl ToString) -> Self {
        Self {
            ok: false,
            error: Some(error.to_string()),
            ..Self::success()
        }
    }
}

struct Runtime {
    parakeet: Option<ParakeetModel>,
    model_path: Option<PathBuf>,
    last_load_ms: Option<u128>,
}

impl Runtime {
    fn new() -> Self {
        Self {
            parakeet: None,
            model_path: None,
            last_load_ms: None,
        }
    }

    fn load_parakeet(&mut self, model_path: &Path) -> Result<u128, String> {
        if self.model_path.as_deref() == Some(model_path) && self.parakeet.is_some() {
            return Ok(0);
        }
        if !model_path.is_dir() {
            return Err(format!(
                "Parakeet model directory was not found: {}",
                model_path.display()
            ));
        }
        let started = Instant::now();
        let model = ParakeetModel::load(&model_path.to_path_buf(), &Quantization::Int8)
            .map_err(|error| error.to_string())?;
        let elapsed = started.elapsed().as_millis();
        self.parakeet = Some(model);
        self.model_path = Some(model_path.to_path_buf());
        self.last_load_ms = Some(elapsed);
        Ok(elapsed)
    }

    fn handle(&mut self, request: Request) -> Response {
        match request.action.as_str() {
            "status" => {
                let mut response = Response::success();
                response.model_path = self
                    .model_path
                    .as_ref()
                    .map(|path| path.to_string_lossy().into_owned());
                response.load_ms = self.last_load_ms;
                response
            }
            "load" => {
                let path = PathBuf::from(request.model_path);
                match self.load_parakeet(&path) {
                    Ok(load_ms) => {
                        let mut response = Response::success();
                        response.model_path = Some(path.to_string_lossy().into_owned());
                        response.load_ms = Some(load_ms);
                        response
                    }
                    Err(error) => Response::failure(error),
                }
            }
            "transcribe" => {
                let model_path = PathBuf::from(request.model_path);
                let audio_path = PathBuf::from(request.audio_path);
                if let Err(error) = self.load_parakeet(&model_path) {
                    return Response::failure(error);
                }
                if !audio_path.is_file() {
                    return Response::failure(format!(
                        "Audio file was not found: {}",
                        audio_path.display()
                    ));
                }
                let started = Instant::now();
                let result = self
                    .parakeet
                    .as_mut()
                    .expect("model was loaded")
                    .transcribe_file(&audio_path, &TranscribeOptions::default());
                match result {
                    Ok(result) => {
                        let mut response = Response::success();
                        response.text = Some(result.text.trim().to_string());
                        response.model_path = Some(model_path.to_string_lossy().into_owned());
                        response.inference_ms = Some(started.elapsed().as_millis());
                        response
                    }
                    Err(error) => Response::failure(error),
                }
            }
            "shutdown" => Response::success(),
            action => Response::failure(format!("Unknown action: {action}")),
        }
    }
}

fn write_response(response: &Response) -> io::Result<()> {
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer(&mut output, response)?;
    output.write_all(b"\n")?;
    output.flush()
}

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut runtime = Runtime::new();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let request = match serde_json::from_str::<Request>(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(&Response::failure(format!("Invalid request: {error}")))?;
                continue;
            }
        };
        let should_stop = request.action == "shutdown";
        write_response(&runtime.handle(request))?;
        if should_stop {
            break;
        }
    }
    Ok(())
}
