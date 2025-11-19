(async () => {
    const settings = await new Promise((resolve) => {
        chrome.storage.local.get(["extensionEnabled", "onlyIfNeeded"], resolve);
    });
    const extensionEnabled = settings.extensionEnabled !== false;
    const onlyIfNeeded = settings.onlyIfNeeded !== false;

    if (!extensionEnabled) {
        return;
    }

    const wasmJsUrl = chrome.runtime.getURL("pkg/wasm_for_vulcan.js");
    const wasmBgUrl = chrome.runtime.getURL(
        "pkg/wasm_for_vulcan_bg.wasm"
    );

    function sabotage(wrapper) {
        if (wrapper.dataset.sabotaged) return;

        console.log("Neutralizowanie oryginalnej captchy...");

        if (!wrapper.dataset.originalRounds) {
            wrapper.dataset.originalRounds = wrapper.dataset.rounds;
        }

        wrapper.dataset.rounds = "0";

        const input = document.getElementById("captcha-response");
        if (input) {
            input.id = "captcha-response-hijacked";
        }

        wrapper.dataset.sabotaged = "true";
    }

    function runSolverInWorker() {
        const wrapper = document.querySelector("div.captcha-wrapper");
        if (!wrapper) return;

        sabotage(wrapper);

        wrapper.parentElement?.classList.add("visible");

        const challenge = wrapper.dataset.challenge;
        const difficulty = parseInt(wrapper.dataset.difficulty);
        const rounds = parseInt(
            wrapper.dataset.originalRounds || wrapper.dataset.rounds
        );

        const responseInput =
            document.getElementById("captcha-response-hijacked") ||
            document.getElementById("captcha-response");

        console.log("Wykryto captchę, uruchamianie workera...");

        const progressFill = document.getElementById("captcha-progress-fill");
        const progressText = document.getElementById("captcha-progress-text");
        if (progressFill) progressFill.style.width = "0%";
        if (progressText) progressText.innerText = "0%";

        const workerCode = `
            import init, { find_single_nonce } from "${wasmJsUrl}";

            self.onmessage = async (e) => {
                const { type, payload } = e.data;

                if (type === 'SOLVE') {
                    const { challenge, difficulty, rounds, wasmBgUrl } = payload;

                    try {
                        await init(wasmBgUrl);

                        let currentBase = challenge;
                        let results = [];

                        for (let i = 0; i < rounds; i++) {
                            const nonce = find_single_nonce(currentBase, difficulty);

                            results.push(nonce);

                            currentBase += nonce;

                            self.postMessage({
                                type: 'PROGRESS',
                                current: i + 1,
                                total: rounds
                            });
                        }

                        self.postMessage({
                            type: 'SUCCESS',
                            solution: results.join(';')
                        });

                    } catch (err) {
                        self.postMessage({ type: 'ERROR', error: err.toString() });
                    }
                }
            };
        `;

        const blob = new Blob([workerCode], { type: "application/javascript" });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl, { type: "module" });

        const startTime = performance.now();

        worker.postMessage({
            type: "SOLVE",
            payload: { challenge, difficulty, rounds, wasmBgUrl },
        });

        worker.onmessage = (e) => {
            const { type, solution, error, current, total } = e.data;

            if (type === "PROGRESS") {
                const percent = Math.floor((current / total) * 100);

                requestAnimationFrame(() => {
                    if (progressFill) progressFill.style.width = percent + "%";
                    if (progressText) progressText.innerText = percent + "%";
                });
            } else if (type === "SUCCESS") {
                const endTime = performance.now();
                const duration = (endTime - startTime).toFixed(2);

                if (progressFill) progressFill.style.width = "100%";
                if (progressText) progressText.innerText = "100%";

                const successLabel = document.querySelector(
                    ".captcha-wrapper .captcha-success-label"
                );
                if (successLabel) {
                    successLabel.textContent = `Pomyślnie rozwiązano w ${duration} ms dzięki WASM!`;
                }

                console.log(
                    "%cℹ️Błąd \"Uncaught (in promise) TypeError: Cannot set properties of null (setting 'value')\" jest przewidziany. Można go zignorować.",
                    "color: lime; font-weight: bold;"
                );
                console.log(`Captcha rozwiązana w ${duration} ms:`, solution);

                if (responseInput) {
                    responseInput.value = solution;
                    // przywracamy poprzedni stan
                    responseInput.id = "captcha-response";
                }

                const progress = document.getElementById(
                    "captcha-progress-wrapper"
                );
                const success = document.getElementById(
                    "captcha-success-wrapper"
                );
                if (progress) progress.classList.remove("active");
                if (success) success.classList.add("active");

                document
                    .querySelectorAll(".captcha-input")
                    .forEach((el) => (el.disabled = false));

                worker.terminate();
                URL.revokeObjectURL(workerUrl);
            } else if (type === "ERROR") {
                console.error("Błąd obliczeń WASM:", error);
            }
        };

        worker.onerror = (err) => {
            console.error(
                "Krytyczny błąd Workera: ",
                err,
                "\nAwaryjne uruchamianie oryginalnego skryptu."
            );
            sessionStorage.setItem("wasm_failed", "true");
            window.location.reload();
        };
    }

    if (!sessionStorage.getItem("wasm_failed")) {
        function isCaptchaVisible() {
            const wrapper = document.querySelector("div.captcha-wrapper");
            return wrapper && wrapper.offsetParent !== null;
        }

        let started = false;
        function tryLaunch() {
            const wrapper = document.querySelector("div.captcha-wrapper");
            const visible = isCaptchaVisible();

            if (wrapper && (visible || !onlyIfNeeded)) {
                runSolverInWorker();
                started = true;
            }
        }

        tryLaunch();

        const observer = new MutationObserver(() => {
            const wrapper = document.querySelector("div.captcha-wrapper");
            if (wrapper) sabotage(wrapper);

            if (!started) tryLaunch();
            if (started) observer.disconnect();
        });

        observer.observe(document.body, {
            attributes: true,
            childList: true,
            subtree: true,
            attributeFilter: ["style", "class"],
        });
    } else {
        console.warn(
            "Niestety, WASM zawodzi. Uruchamiany jest oryginalny skrypt Vulcana."
        );
        sessionStorage.removeItem("wasm_failed");
    }
})();
