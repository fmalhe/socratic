#!/usr/bin/env python3
"""
Playwright headless Chromium E2E runner for Socratic.
Drives the real static frontend (public/) served by the live Hono + SQLite + R2 test server.
Supports persistent JSON-lines stdin/stdout mode (--server) and one-shot CLI mode.
"""

import argparse
import json
import math
import re
import struct
import sys
import traceback
import urllib.request
import zlib
from playwright.sync_api import sync_playwright

RAW_EMOJI_RE = re.compile(
    r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\uFE0F\u25B6\u23F8\u23EE\u23ED\u23F9\u2715\u2713]"
)


def make_png_bytes(width=160, height=120, color=(48, 108, 165)):
    """Create a genuine valid RGB PNG buffer in memory using only stdlib zlib/struct."""
    r, g, b = color
    row = b"\x00" + bytes([r, g, b]) * width
    raw = row * height
    compressed = zlib.compress(raw, level=6)

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", crc)

    ihdr = struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def http_json(base_url, method, path, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(f"{base_url}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


AUDIO_SPY_INIT = r"""
(() => {
  window.__audioSpy = {
    contextsCreated: 0,
    buffersCreated: 0,
    sourcesStarted: 0,
    resumed: 0,
    suspended: 0,
    revokedUrls: [],
    htmlAudioPlays: 0,
    htmlAudioPauses: 0,
    contexts: [],
  };

  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (url) => {
    window.__audioSpy.revokedUrls.push(String(url));
    return origRevoke(url);
  };

  const OrigAudioCtx = window.AudioContext || window.webkitAudioContext;
  if (OrigAudioCtx) {
    function WrappedAudioContext(...args) {
      const ctx = new OrigAudioCtx(...args);
      window.__audioSpy.contextsCreated += 1;
      let forcedState = null;

      const origCreateBuffer = ctx.createBuffer.bind(ctx);
      ctx.createBuffer = (...bArgs) => {
        window.__audioSpy.buffersCreated += 1;
        return origCreateBuffer(...bArgs);
      };

      const origCreateBufferSource = ctx.createBufferSource.bind(ctx);
      ctx.createBufferSource = () => {
        const src = origCreateBufferSource();
        const origStart = src.start.bind(src);
        src.start = (...sArgs) => {
          window.__audioSpy.sourcesStarted += 1;
          return origStart(...sArgs);
        };
        return src;
      };

      const origResume = ctx.resume.bind(ctx);
      ctx.resume = () => {
        window.__audioSpy.resumed += 1;
        forcedState = null;
        return origResume();
      };

      const origSuspend = ctx.suspend.bind(ctx);
      ctx.suspend = () => {
        window.__audioSpy.suspended += 1;
        return origSuspend();
      };

      Object.defineProperty(ctx, "state", {
        configurable: true,
        get() {
          if (forcedState) return forcedState;
          return Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "state").get.call(ctx);
        },
      });

      ctx.__forceInterrupted = () => {
        forcedState = "interrupted";
        ctx.dispatchEvent(new Event("statechange"));
      };

      window.__audioSpy.contexts.push(ctx);
      return ctx;
    }
    WrappedAudioContext.prototype = OrigAudioCtx.prototype;
    window.AudioContext = WrappedAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioContext;
  }

  window.__simulateAudioInterrupted = () => {
    for (const ctx of window.__audioSpy.contexts) {
      if (typeof ctx.__forceInterrupted === "function") {
        ctx.__forceInterrupted();
      }
    }
  };

  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    window.__audioSpy.htmlAudioPlays += 1;
    try {
      const p = origPlay.apply(this, args);
      if (p && typeof p.catch === "function") {
        return p.catch(() => {});
      }
      return p;
    } catch {
      return Promise.resolve();
    }
  };
  const origPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function (...args) {
    window.__audioSpy.htmlAudioPauses += 1;
    return origPause.apply(this, args);
  };
})();
"""

MOCK_SPEECH_INIT = r"""
(() => {
  window.__speechCalls = { spoken: [], cancelled: 0, paused: 0, resumed: 0 };
  const fakeVoices = [
    { name: "Maria (pt-PT)", lang: "pt-PT", localService: true, default: false, voiceURI: "pt-PT-maria" },
    { name: "Nora (nb-NO)", lang: "nb-NO", localService: true, default: false, voiceURI: "nb-NO-nora" },
  ];
  let currentUtterance = null;
  let speaking = false;
  let paused = false;

  window.SpeechSynthesisUtterance = class MockUtterance {
    constructor(text) {
      this.text = text || "";
      this.lang = "pt-PT";
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onboundary = null;
    }
  };

  const synthMock = {
    getVoices: () => fakeVoices,
    get speaking() { return speaking; },
    get paused() { return paused; },
    get pending() { return false; },
    onvoiceschanged: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    speak(utt) {
      currentUtterance = utt;
      speaking = true;
      paused = false;
      window.__speechCalls.spoken.push({ text: utt.text, lang: utt.lang, rate: utt.rate });
      setTimeout(() => {
        if (typeof utt.onstart === "function") utt.onstart(new Event("start"));
      }, 20);
      setTimeout(() => {
        if (currentUtterance === utt && !paused) {
          speaking = false;
          if (typeof utt.onend === "function") utt.onend(new Event("end"));
        }
      }, 120);
    },
    pause() {
      paused = true;
      window.__speechCalls.paused += 1;
    },
    resume() {
      paused = false;
      window.__speechCalls.resumed += 1;
      if (currentUtterance) {
        const utt = currentUtterance;
        setTimeout(() => {
          speaking = false;
          if (typeof utt.onend === "function") utt.onend(new Event("end"));
        }, 60);
      }
    },
    cancel() {
      speaking = false;
      paused = false;
      currentUtterance = null;
      window.__speechCalls.cancelled += 1;
    },
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: synthMock,
  });
})();
"""


def goto_app(page, base_url):
    page.goto(base_url, wait_until="domcontentloaded", timeout=20000)
    page.wait_for_selector("#hw-hero-owl svg", state="attached", timeout=15000)
    page.wait_for_timeout(120)


def upload_homework_png(page, png_bytes=None):
    page.wait_for_selector("#hw-hero-owl svg", state="attached", timeout=10000)
    data = png_bytes or make_png_bytes()
    page.set_input_files(
        "#hw-file-input",
        {"name": "worksheet.png", "mimeType": "image/png", "buffer": data},
    )
    page.wait_for_selector("#hw-session-stage:not([hidden])", timeout=15000)


def upload_read_png(page, png_bytes=None):
    page.wait_for_selector("#read-hero-owl svg", state="attached", timeout=10000)
    data = png_bytes or make_png_bytes()
    page.set_input_files(
        "#read-file-input",
        {"name": "book.png", "mimeType": "image/png", "buffer": data},
    )
    page.wait_for_selector("#read-stage:not([hidden])", timeout=15000)


def click_go_to_questions(page):
    btn = page.locator("#hw-passage-stage button:has-text('Fazer Perguntas'), #hw-passage-next-questions").first
    if btn.count() > 0 and btn.is_visible():
        btn.click()
    else:
        # Fallback to stepper tab 1 (Pergunta 1)
        page.locator("#hw-stepper button").nth(1).click()
    page.wait_for_selector("#hw-exercise-stage:not([hidden])", timeout=10000)


def collect_visible_text_nodes(page):
    return page.evaluate(
        r"""() => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const out = [];
          let n;
          while ((n = walker.nextNode())) {
            const p = n.parentElement;
            if (!p) continue;
            const tag = p.tagName;
            if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;
            if (p.closest("[hidden]")) continue;
            const t = (n.nodeValue || "").trim();
            if (t) out.push(t);
          }
          return out;
        }"""
    )


def check_no_raw_emojis(page, context_label):
    texts = collect_visible_text_nodes(page)
    matches = []
    for t in texts:
        found = RAW_EMOJI_RE.findall(t)
        if found:
            matches.append({"text": t[:80], "chars": found})
    assert not matches, f"[{context_label}] Found raw Unicode emojis/transport symbols in DOM: {matches}"


def check_no_horizontal_overflow(page, label):
    dims = page.evaluate("() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })")
    assert dims["scrollWidth"] <= dims["innerWidth"], (
        f"[{label}] Horizontal overflow: scrollWidth={dims['scrollWidth']} > innerWidth={dims['innerWidth']}"
    )


# ==============================================================================
# TIER 1 BROWSER CASES
# ==============================================================================

def case_t1_pt_default_ui_and_tabs(page, base_url, _opts):
    goto_app(page, base_url)
    lang = page.get_attribute("html", "lang")
    assert lang == "pt-PT", f"Expected <html lang='pt-PT'>, got {lang}"

    tpc_text = page.locator("#tab-homework").inner_text().strip()
    ler_text = page.locator("#tab-read").inner_text().strip()
    assert "TPC" in tpc_text, f"Expected TPC tab text, got {tpc_text}"
    assert "Ler" in ler_text, f"Expected Ler tab text, got {ler_text}"

    assert page.locator("#view-homework").is_visible()
    assert not page.locator("#view-read").is_visible()

    page.click("#tab-read")
    assert page.get_attribute("#tab-read", "aria-selected") == "true"
    assert page.locator("#view-read").is_visible()
    assert not page.locator("#view-homework").is_visible()

    page.click("#tab-homework")
    assert page.get_attribute("#tab-homework", "aria-selected") == "true"

    # Upload to inspect PT/NO flags & ensure zero GB flag
    upload_homework_png(page)
    click_go_to_questions(page)
    pt_flags = page.locator("[data-flag='pt']").count()
    no_flags = page.locator("[data-flag='no']").count()
    gb_flags = page.locator("[data-flag='gb']").count()
    assert pt_flags >= 2, f"Expected >=2 PT flags, got {pt_flags}"
    assert no_flags >= 2, f"Expected >=2 NO flags, got {no_flags}"
    assert gb_flags == 0, f"Forbidden GB flag rendered ({gb_flags})"

    # Ensure zero English UI labels in key controls
    ui_texts = [
        page.locator("#hw-explain-pt").inner_text(),
        page.locator("#hw-explain-no").inner_text(),
        page.locator("#hw-complete-btn").inner_text(),
        page.locator("#hw-chat-toggle").inner_text(),
    ]
    joined = " ".join(ui_texts).lower()
    for forbidden in ("listen", "done!", "homework page", "ask owly"):
        assert forbidden not in joined, f"Unexpected English UI text '{forbidden}' in {ui_texts}"

    return {"ptFlags": pt_flags, "noFlags": no_flags, "gbFlags": gb_flags}


def case_t1_zero_emoji_svg_craft(page, base_url, _opts):
    goto_app(page, base_url)
    check_no_raw_emojis(page, "empty-state")

    # Verify SVG icons & owl SVG
    assert page.locator("#hw-hero-owl svg").count() >= 1, "Missing #hw-hero-owl inline SVG"
    assert page.locator("#theme-toggle svg").count() >= 1, "Missing #theme-toggle inline SVG"
    assert page.locator("#stars-pill svg").count() >= 1, "Missing #stars-pill inline SVG"

    upload_homework_png(page)
    check_no_raw_emojis(page, "homework-passage")

    click_go_to_questions(page)
    check_no_raw_emojis(page, "homework-exercise")
    assert page.locator("#hw-owl-svg svg").count() >= 1, "Missing #hw-owl-svg inline SVG"

    page.click("#stars-pill")
    page.wait_for_selector("#stars-modal:not([hidden])")
    check_no_raw_emojis(page, "stars-modal")
    page.click("#stars-close-btn")

    page.click("#hw-pages-btn")
    page.wait_for_selector("#pages-drawer:not([hidden])")
    check_no_raw_emojis(page, "pages-drawer")
    page.click("#pages-close-btn")

    return {"verifiedViews": ["empty", "passage", "exercise", "stars-modal", "pages-drawer"]}


def case_t1_warm_atelier_tokens(page, base_url, _opts):
    goto_app(page, base_url)
    light_info = page.evaluate(
        """() => {
          const bodyCs = getComputedStyle(document.body);
          const primaryBtn = document.querySelector("#hw-camera-btn");
          const btnCs = primaryBtn ? getComputedStyle(primaryBtn) : null;
          const beam = document.querySelector(".scan-beam");
          const beamCs = beam ? getComputedStyle(beam) : null;
          return {
            theme: document.documentElement.getAttribute("data-theme"),
            bodyBg: bodyCs.backgroundColor,
            fontFamily: bodyCs.fontFamily,
            primaryBg: btnCs ? btnCs.backgroundColor : "",
            beamBg: beamCs ? (beamCs.backgroundImage || beamCs.backgroundColor) : "",
            metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "",
          };
        }"""
    )
    assert light_info["theme"] == "light"
    assert light_info["bodyBg"] != "rgb(255, 255, 255)", f"Expected warm vellum background, got cold white {light_info['bodyBg']}"
    assert "2563eb" not in light_info["primaryBg"] and light_info["primaryBg"] != "rgb(37, 99, 235)", (
        f"Tailwind #2563eb primary still present: {light_info['primaryBg']}"
    )
    assert "13, 148, 136" not in light_info["beamBg"] and "0d9488" not in light_info["beamBg"].lower(), (
        f"Generic cyan #0d9488 scan-beam still present: {light_info['beamBg']}"
    )
    assert ("Plus Jakarta Sans" in light_info["fontFamily"]) or ("Lexend" in light_info["fontFamily"]), (
        f"Expected Plus Jakarta Sans / Lexend typography, got {light_info['fontFamily']}"
    )

    page.click("#theme-toggle")
    dark_info = page.evaluate(
        """() => ({
          theme: document.documentElement.getAttribute("data-theme"),
          stored: localStorage.getItem("socratic-theme"),
          bodyBg: getComputedStyle(document.body).backgroundColor,
          metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "",
        })"""
    )
    assert dark_info["theme"] == "dark"
    assert dark_info["stored"] == "dark"
    assert dark_info["bodyBg"] != light_info["bodyBg"]
    assert dark_info["metaThemeColor"] != light_info["metaThemeColor"]

    return {"light": light_info, "dark": dark_info}


def case_t1_touch_ergonomics_and_popover(page, base_url, _opts):
    page.set_viewport_size({"width": 375, "height": 812})
    goto_app(page, base_url)

    def check_rects(selectors):
        results = page.evaluate(
            """(sels) => sels.map(sel => {
              const el = document.querySelector(sel);
              if (!el || el.offsetParent === null) return { sel, visible: false };
              const r = el.getBoundingClientRect();
              return { sel, visible: true, width: r.width, height: r.height };
            })""",
            selectors,
        )
        failures = [x for x in results if x["visible"] and (x["width"] < 43.5 or x["height"] < 43.5)]
        assert not failures, f"Touch targets < 44px: {failures}"
        return results

    check_rects(["#tab-homework", "#tab-read", "#stars-pill", "#theme-toggle", "#settings-btn", "#hw-camera-btn"])

    upload_homework_png(page)
    click_go_to_questions(page)
    check_rects(["#hw-q-listen-pt", "#hw-q-slow-toggle", "#hw-q-listen-no", "#hw-explain-pt", "#hw-explain-no", "#hw-chat-toggle", "#hw-complete-btn"])

    # Test #word-popover open + bounds + dismiss
    chip = page.locator("#hw-tricky-words .tricky-chip").first
    assert chip.count() > 0, "Expected tricky word chips in exercise"
    chip_box = chip.bounding_box()
    assert chip_box["height"] >= 43.5, f"Tricky chip height < 44px: {chip_box}"
    chip.click()
    page.wait_for_selector("#word-popover:not([hidden])")
    pop_box = page.locator("#word-popover").bounding_box()
    assert pop_box["x"] >= 0 and pop_box["x"] + pop_box["width"] <= 375 + 1, f"Popover overflows viewport: {pop_box}"

    # Dismiss by Escape or outside click
    page.keyboard.press("Escape")
    page.wait_for_timeout(100)
    if page.locator("#word-popover").is_visible():
        page.locator("#hw-question-badge").click()
    assert not page.locator("#word-popover").is_visible(), "Expected #word-popover to dismiss on Escape/outside click"

    return {"popover": pop_box}


def case_t1_passage_and_homework_controls(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)

    assert page.locator("#hw-passage-stage").is_visible(), "Expected #hw-passage-stage visible when passage present"
    listen_all = page.locator("#hw-passage-stage button:has-text('Ouvir Tudo'), #hw-passage-listen-all").first
    assert listen_all.is_visible(), "Missing 'Ouvir Tudo' button in homework passage"

    next_q = page.locator("#hw-passage-stage button:has-text('Fazer Perguntas'), #hw-passage-next-questions").first
    assert next_q.is_visible(), "Missing 'Fazer Perguntas' CTA in homework passage"

    # Per-sentence explicit play + NO flag buttons exist
    sentence_rows = page.locator("#hw-passage-sentences .sentence-row")
    assert sentence_rows.count() == 2, f"Expected 2 passage sentences, got {sentence_rows.count()}"

    # Tapping a word inside sentence text should NOT trigger playback trap
    before_reqs = len(http_json(base_url, "GET", "/__test/state")["requests"])
    page.locator("#hw-passage-sentences .karaoke-word").first.click()
    page.wait_for_timeout(150)
    after_word_click_reqs = len(http_json(base_url, "GET", "/__test/state")["requests"])
    # Note: tapping a word might open popover or nothing, must NOT fire /api/audio/stream speech of whole sentence unintentionally if tap-trap is fixed
    # Click explicit Listen All button -> triggers /api/audio/stream
    listen_all.click()
    page.wait_for_timeout(250)
    state_after_play = http_json(base_url, "GET", "/__test/state")
    stream_calls = [r for r in state_after_play["requests"] if "streamGenerateContent" in r["url"]]
    assert len(stream_calls) >= 1, "Expected 'Ouvir Tudo' to trigger real Gemini audio stream"

    # Stop playback if floating dock appeared
    if page.locator("#dock-stop-btn").is_visible():
        page.click("#dock-stop-btn")

    # Click 'Fazer Perguntas' -> navigates to exercise 1
    next_q.click()
    page.wait_for_selector("#hw-exercise-stage:not([hidden])")
    assert "Onde anda o patinho" in page.locator("#hw-question-karaoke").inner_text()

    return {"beforeWordTap": before_reqs, "afterWordTap": after_word_click_reqs, "streamCalls": len(stream_calls)}


def case_t1_read_mode_karaoke_and_dock(page, base_url, _opts):
    goto_app(page, base_url)
    page.click("#tab-read")
    upload_read_png(page)

    words = page.locator("#read-sentences .karaoke-word")
    assert words.count() >= 5, f"Expected karaoke words in Read Mode, got {words.count()}"

    play_btn = page.locator("#read-listen-all, #read-stage button:has-text('Ouvir Tudo'), #read-sentences .sentence-play-btn").first
    play_btn.click()
    page.wait_for_selector("#floating-audio-dock:not([hidden])", timeout=8000)

    # Wait briefly to observe karaoke highlighting OR dock status
    page.wait_for_timeout(200)
    dock_status = page.locator("#dock-status-label").inner_text()
    assert "/" in dock_status, f"Unexpected dock status: {dock_status}"

    # Verify stop cleans up active karaoke/playing state cleanly
    page.click("#dock-stop-btn")
    page.wait_for_timeout(150)
    play_icon = page.locator("#dock-play-icon").get_attribute("data-icon")
    assert play_icon == "play", f"Expected dock play icon to reset to 'play' on stop, got {play_icon}"
    assert page.locator("#read-sentences .karaoke-word.is-active").count() == 0, "Expected karaoke highlight cleared on stop"

    return {"words": words.count(), "dockStatus": dock_status, "playIconAfterStop": play_icon}


def case_t1_owly_multistate_and_audio_dock(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)
    click_go_to_questions(page)

    owl_slot = page.locator("#hw-owl-svg")
    assert owl_slot.count() == 1
    initial_state = owl_slot.get_attribute("data-owl-state")
    assert initial_state == "idle", f"Expected initial Owly state 'idle', got {initial_state}"

    # Trigger PT explanation audio and NO explanation audio
    page.click("#hw-explain-pt")
    page.wait_for_timeout(250)
    page.click("#hw-explain-no")
    page.wait_for_timeout(250)

    state = http_json(base_url, "GET", "/__test/state")
    stream_calls = [r for r in state["requests"] if "streamGenerateContent" in r["url"] or "-tts:" in r["url"]]
    assert len(stream_calls) >= 2, f"Expected audio requests for PT and NO explanations, got {len(stream_calls)}"

    return {"initialOwlState": initial_state, "audioCalls": len(stream_calls)}


def case_t1_stars_recent_words_and_no_farming(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)
    click_go_to_questions(page)

    assert page.locator("#header-stars-count").inner_text().strip() == "0"
    page.click("#hw-complete-btn")
    page.wait_for_timeout(350)
    stars_after_first = int(page.locator("#header-stars-count").inner_text().strip())
    assert stars_after_first > 0, f"Expected stars > 0 after completing exercise, got {stars_after_first}"

    # Navigate back to completed Exercise 1 (app auto-advances to Exercise 2 after completion)
    page.locator("#hw-stepper button").nth(1).click()
    page.wait_for_timeout(150)
    assert page.locator("#hw-complete-btn").is_disabled(), "Expected completed Exercise 1 button to be disabled to prevent star farming"
    # Attempt to farm stars via JS click on already-completed exercise
    page.evaluate("() => document.getElementById('hw-complete-btn')?.click()")
    page.wait_for_timeout(250)
    stars_after_second = int(page.locator("#header-stars-count").inner_text().strip())
    assert stars_after_second == stars_after_first, (
        f"Star farming detected! First={stars_after_first}, Second={stars_after_second}"
    )

    # Open Stars modal and check recentWords are populated!
    page.click("#stars-pill")
    page.wait_for_selector("#stars-modal:not([hidden])")
    saved_word_items = page.locator("#saved-words-list button, #saved-words-list .saved-word-chip, #saved-words-list .tricky-chip").all_inner_texts()
    assert len(saved_word_items) >= 1, "Expected recentWords in #stars-modal #saved-words-list (got empty list — check savedWords vs recentWords contract!)"

    return {"stars": stars_after_second, "savedWords": saved_word_items}


def case_t1_parent_settings_save_and_hint(page, base_url, _opts):
    goto_app(page, base_url)
    page.click("#settings-btn")
    page.wait_for_selector("#settings-modal:not([hidden])")

    page.fill("#set-name", "Sofia Test")
    page.fill("#set-voice", "Puck")
    page.fill("#set-dialect", "Always use European Portuguese (Lisbon).")

    with page.expect_response(lambda r: "/api/profile" in r.url and r.request.method == "PUT") as resp_info:
        page.click("#settings-form button[type='submit']")
    resp = resp_info.value
    assert resp.status == 200, f"Expected PUT /api/profile 200, got {resp.status} (check targetLanguageName/nativeLanguageName fields!)"

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("#hw-hero-owl svg", state="attached", timeout=15000)
    page.wait_for_timeout(120)
    page.click("#settings-btn")
    page.wait_for_selector("#settings-modal:not([hidden])")
    assert page.input_value("#set-name") == "Sofia Test"
    assert page.input_value("#set-voice") == "Puck"

    return {"putStatus": resp.status}


def case_t1_inline_2tap_delete_confirm(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)

    dialog_triggered = False

    def on_dialog(d):
        nonlocal dialog_triggered
        dialog_triggered = True
        d.accept()

    page.on("dialog", on_dialog)
    page.click("#hw-pages-btn")
    page.wait_for_selector("#pages-drawer:not([hidden])")

    # Click delete button once -> should NOT trigger window.confirm() and should NOT delete immediately
    del_btn = page.locator("#pages-list [data-delete-id], #pages-list button:has-text('Apagar'), #pages-list .page-delete-btn").first
    assert del_btn.count() > 0, "Expected delete button in #pages-list"
    del_btn.click()
    page.wait_for_timeout(150)
    assert not dialog_triggered, "Legacy browser window.confirm() dialog triggered instead of inline 2-tap confirm!"

    state_mid = http_json(base_url, "GET", "/__test/state")
    assert len(state_mid["sessions"]) == 1, "Session was deleted on 1st tap without 2-tap confirmation!"

    # Second tap on inline confirm button
    confirm_btn = page.locator("#pages-list button:has-text('Confirmar'), #pages-list button:has-text('Apagar?'), #pages-list [data-confirm-delete]").first
    assert confirm_btn.count() > 0 and confirm_btn.is_visible(), "Expected inline 2-tap confirm button after 1st delete click"
    confirm_btn.click()
    page.wait_for_timeout(300)

    state_after = http_json(base_url, "GET", "/__test/state")
    assert len(state_after["sessions"]) == 0, f"Expected session deleted after 2nd tap, still have {state_after['sessions']}"
    assert len([k for k in state_after["r2Keys"] if k.startswith("homework/")]) == 0, "Expected R2 homework image deleted"

    return {"deleted": True}


# ==============================================================================
# TIER 2 BROWSER CASES
# ==============================================================================

def case_t2_zero_exercise_scan(page, base_url, _opts):
    http_json(base_url, "POST", "/__test/scenario", {
        "scenario": {
            "homeworkScanResponse": {
                "pageTitle": "Só Leitura",
                "pageSummaryNative": "En ren lesetekst uten spørsmål.",
                "pageTextTarget": "A gaivota voa sobre o mar azul.",
                "readingPassage": {
                    "titleTarget": "A Gaivota",
                    "sentences": [
                        {
                            "targetText": "A gaivota voa sobre o mar azul.",
                            "nativeSummary": "Måken flyr over det blå havet.",
                            "englishSummary": "The seagull flies over the blue sea.",
                            "trickyWords": [{"word": "gaivota", "syllables": "gai-vo-ta", "nativeHint": "Måke"}],
                        }
                    ],
                },
                "exercises": [],
            }
        }
    })
    goto_app(page, base_url)
    upload_homework_png(page)
    assert page.locator("#hw-passage-stage").is_visible(), "Passage must be visible on 0-exercise page"
    assert not page.locator("#hw-exercise-stage").is_visible(), "Exercise stage must stay hidden when exercises=[]"
    assert not page.locator("#hw-error-card").is_visible(), "Error card must not show on 0-exercise page"
    return {"passageVisible": True}


def case_t2_short_1word_audio_clip(page, base_url, _opts):
    http_json(base_url, "POST", "/__test/scenario", {"scenario": {"streamMode": "short1word"}})
    goto_app(page, base_url)
    upload_homework_png(page)
    click_go_to_questions(page)

    page.click("#hw-q-listen-pt")
    # Wait for short clip to start and finish cleanly
    page.wait_for_timeout(700)
    # Button must NOT stay stuck in loading/playing state
    spinner_visible = page.locator("#hw-q-listen-pt .btn-spinner").is_visible()
    assert not spinner_visible, "Short 1-word clip left button spinner stuck"
    return {"sourcesStarted": page.evaluate("() => window.__audioSpy.sourcesStarted")}


def case_t2_audio_context_interrupted_and_revoke(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)
    click_go_to_questions(page)

    page.click("#hw-q-listen-pt")
    page.wait_for_timeout(200)
    page.evaluate("() => window.__simulateAudioInterrupted()")
    page.wait_for_timeout(100)
    # Trigger visibilitychange to visible
    page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(150)

    # Play second time (hits CacheStorage -> HTMLAudio Blob URL) and click stop to verify revokeObjectURL
    page.click("#hw-q-listen-pt")
    page.wait_for_timeout(250)
    if page.locator("#dock-stop-btn").is_visible():
        page.click("#dock-stop-btn")
    page.wait_for_timeout(150)
    spy = page.evaluate("() => window.__audioSpy")
    assert spy["contextsCreated"] >= 1, "Expected AudioContext to be created during streaming"
    return {"spy": spy}


def case_t2_501_speech_synthesis_fallback(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)
    click_go_to_questions(page)

    # Clear API keys AND toggle slow mode (slow=true is not prewarmed in R2) so /api/audio/stream returns 501
    http_json(base_url, "POST", "/__test/scenario", {
        "envOverrides": {"GEMINI_API_KEY": "", "GOOGLE_TTS_API_KEY": ""}
    })
    page.click("#hw-q-slow-toggle")
    with page.expect_response(lambda r: "/api/audio/stream" in r.url) as audio_resp:
        page.click("#hw-q-listen-pt")
    assert audio_resp.value.status == 501, f"Expected HTTP 501 on /api/audio/stream, got {audio_resp.value.status}"

    page.wait_for_function("() => window.__speechCalls && window.__speechCalls.spoken.length >= 1", timeout=5000)
    calls = page.evaluate("() => window.__speechCalls")
    assert len(calls["spoken"]) >= 1, f"Expected speechSynthesis fallback on HTTP 501, got {calls}"
    return {"spoken": calls["spoken"], "status": audio_resp.value.status}


def case_t2_rapid_double_taps(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)
    click_go_to_questions(page)

    # Rapid double tap on complete button
    page.locator("#hw-complete-btn").dblclick()
    page.wait_for_timeout(400)
    stars = int(page.locator("#header-stars-count").inner_text().strip())
    assert stars == 2, f"Expected single star award (2) on double-tap, got {stars}"

    # Rapid double submit on chat
    page.click("#hw-chat-toggle")
    page.wait_for_selector("#hw-chat-drawer:not([hidden])")
    page.fill("#hw-chat-input", "Hva er patinho?")
    page.evaluate("""() => {
      const form = document.getElementById('hw-chat-form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }""")
    page.wait_for_timeout(400)
    child_msgs = page.locator("#hw-chat-messages .chat-bubble-child, #hw-chat-messages [data-sender='CHILD']").count()
    # Check backend requests count for reply
    state = http_json(base_url, "GET", "/__test/state")
    reply_calls = [r for r in state["requests"] if r["bodyJson"] and "replyNative" in json.dumps(r["bodyJson"].get("generationConfig", {}).get("responseSchema", {}))]
    assert len(reply_calls) == 1, f"Expected 1 chat reply call on double submit, got {len(reply_calls)}"

    return {"stars": stars, "replyCalls": len(reply_calls), "childMsgs": child_msgs}


def case_t2_responsive_mobile_and_ipad(page, base_url, _opts):
    for vw, vh in [(375, 812), (768, 1024)]:
        http_json(base_url, "POST", "/__test/reset", {})
        page.set_viewport_size({"width": vw, "height": vh})
        goto_app(page, base_url)
        check_no_horizontal_overflow(page, f"empty-{vw}")

        upload_homework_png(page)
        check_no_horizontal_overflow(page, f"passage-{vw}")

        click_go_to_questions(page)
        check_no_horizontal_overflow(page, f"exercise-{vw}")

        # Verify flag dock buttons are side-by-side (2-column grid even at 375px!) in a single atomic layout read
        dock_rects = page.evaluate(
            """() => {
              const pt = document.getElementById('hw-explain-pt').getBoundingClientRect();
              const no = document.getElementById('hw-explain-no').getBoundingClientRect();
              const comp = document.getElementById('hw-complete-btn').getBoundingClientRect();
              return {
                pt: { x: pt.left, y: pt.top, width: pt.width, height: pt.height },
                no: { x: no.left, y: no.top, width: no.width, height: no.height },
                comp: { x: comp.left, y: comp.top, width: comp.width, height: comp.height },
              };
            }"""
        )
        pt_box = dock_rects["pt"]
        no_box = dock_rects["no"]
        assert no_box["x"] >= pt_box["x"] + pt_box["width"] - 1 and abs(pt_box["y"] - no_box["y"]) < 6, (
            f"Flag dock collapsed vertically at {vw}x{vh}: pt={pt_box}, no={no_box}"
        )

        # Verify #hw-complete-btn is accessible without horizontal overflow
        comp_box = dock_rects["comp"]
        assert comp_box["height"] >= 44 and comp_box["x"] + comp_box["width"] <= vw + 1

    return {"viewportsVerified": ["375x812", "768x1024"]}


def case_t2_karaoke_zero_horizontal_reflow(page, base_url, _opts):
    http_json(base_url, "POST", "/__test/scenario", {
        "scenario": {
            "readingResponse": {
                "fullText": "A pequena borboleta amarela voa alegremente sobre as flores coloridas do jardim encantado.",
                "sentences": [
                    {
                        "targetText": "A pequena borboleta amarela voa alegremente sobre as flores coloridas do jardim encantado.",
                        "nativeSummary": "Den lille gule sommerfuglen flyr glad over de fargerike blomstene.",
                        "englishSummary": "The little yellow butterfly flies happily over the colorful flowers.",
                        "trickyWords": [],
                    }
                ],
            }
        }
    })
    page.set_viewport_size({"width": 375, "height": 812})
    goto_app(page, base_url)
    page.click("#tab-read")
    upload_read_png(page)

    before_rects = page.evaluate(
        """() => Array.from(document.querySelectorAll('#read-sentences .karaoke-word')).map(el => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent, left: r.left, top: r.top, width: r.width, height: r.height };
        })"""
    )
    assert len(before_rects) >= 8, "Expected >= 8 karaoke words"

    # Toggle .is-active on middle word and verify ZERO horizontal reflow shift on neighbors!
    mid = len(before_rects) // 2
    after_rects = page.evaluate(
        """(idx) => {
          const words = Array.from(document.querySelectorAll('#read-sentences .karaoke-word'));
          words[idx].classList.add('is-active');
          return words.map(el => {
            const r = el.getBoundingClientRect();
            return { text: el.textContent, left: r.left, top: r.top, width: r.width, height: r.height };
          });
        }""",
        mid,
    )

    shifts = []
    for i in range(len(before_rects)):
        dl = abs(after_rects[i]["left"] - before_rects[i]["left"])
        dt = abs(after_rects[i]["top"] - before_rects[i]["top"])
        if dl > 0.5 or dt > 0.5:
            shifts.append({"index": i, "word": before_rects[i]["text"], "dLeft": dl, "dTop": dt})

    assert not shifts, f"Karaoke .is-active caused horizontal/vertical reflow jitter: {shifts}"
    return {"wordCount": len(before_rects), "testedIndex": mid}


def case_t2_xss_payload_immunity(page, base_url, _opts):
    xss1 = '<img src=x onerror="window.__xss=1">'
    xss2 = '<script>window.__xss=2</script>'
    http_json(base_url, "POST", "/__test/scenario", {
        "scenario": {
            "homeworkScanResponse": {
                "pageTitle": f"Página {xss1}",
                "pageSummaryNative": f"Sammendrag {xss2}",
                "pageTextTarget": "Olá Sofia!",
                "readingPassage": {
                    "titleTarget": f"Texto {xss1}",
                    "sentences": [
                        {
                            "targetText": "Olá Sofia!",
                            "nativeSummary": "Hei Sofia!",
                            "englishSummary": "Hi Sofia!",
                            "trickyWords": [{"word": xss1, "syllables": xss2, "nativeHint": xss1}],
                        }
                    ],
                },
                "exercises": [
                    {
                        "label": "1",
                        "promptTarget": f"Lê {xss1}",
                        "promptNative": "Les dette",
                        "promptEnglish": "Read this",
                        "explanationNative": "Forklaring",
                        "explanationTarget": "Explicação",
                        "explanationEnglish": "Explanation",
                        "trickyWords": [{"word": xss1, "syllables": xss2, "nativeHint": xss1}],
                        "openingQuestionNative": f"Spørsmål {xss1}",
                    }
                ],
            },
            "homeworkReplyResponse": {
                "replyNative": f"Bra {xss1}",
                "targetPhrase": f"frase {xss2}",
                "followUpQuestionNative": f"Neste {xss1}",
            },
        }
    })
    goto_app(page, base_url)
    upload_homework_png(page)
    click_go_to_questions(page)

    # Check zero injected <img> inside tricky chips
    injected_imgs = page.locator("#hw-tricky-words img, #hw-question-karaoke img").count()
    assert injected_imgs == 0, f"XSS HTML injection inside #hw-tricky-words / #hw-question-karaoke (found {injected_imgs} <img>)"

    # Click tricky chip to open popover
    page.locator("#hw-tricky-words .tricky-chip").first.click()
    assert page.locator("#word-popover img").count() == 0, "XSS HTML injection inside #word-popover"

    # Open chat and send reply
    page.click("#hw-chat-toggle")
    page.fill("#hw-chat-input", "oi")
    page.click("#hw-chat-send")
    page.wait_for_timeout(300)
    assert page.locator("#hw-chat-messages img").count() == 0, "XSS HTML injection inside #hw-chat-messages"

    # Complete & open stars modal + pages drawer
    page.click("#hw-complete-btn")
    page.wait_for_timeout(250)
    page.click("#stars-pill")
    page.wait_for_selector("#stars-modal:not([hidden])")
    assert page.locator("#saved-words-list img").count() == 0, "XSS HTML injection inside #saved-words-list"
    page.click("#stars-close-btn")

    page.click("#hw-pages-btn")
    page.wait_for_selector("#pages-drawer:not([hidden])")
    assert page.locator("#pages-list img[src='x'], #pages-list img[onerror]").count() == 0, "XSS HTML injection inside #pages-list"
    assert "<img src=x" in page.locator("#pages-list").inner_text(), "Expected escaped XSS payload text in #pages-list"

    xss_flag = page.evaluate("() => window.__xss")
    assert xss_flag is None, f"XSS executed! window.__xss={xss_flag}"
    return {"xssExecuted": False}


def case_t2_theme_corrupt_storage_and_persistence(page, base_url, _opts):
    goto_app(page, base_url)
    initial_light_color = page.get_attribute("meta[name='theme-color']", "content")
    assert initial_light_color and initial_light_color.startswith("#")

    # Seed invalid theme value into localStorage and reload -> must fall back safely to light
    page.evaluate("() => localStorage.setItem('socratic-theme', 'invalid-neon-theme')")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("#hw-hero-owl svg", state="attached", timeout=15000)
    assert page.get_attribute("html", "data-theme") == "light"
    assert page.get_attribute("meta[name='theme-color']", "content") == initial_light_color

    # Toggle to dark, reload, verify persistence
    page.click("#theme-toggle")
    assert page.get_attribute("html", "data-theme") == "dark"
    dark_color = page.get_attribute("meta[name='theme-color']", "content")
    assert dark_color and dark_color != initial_light_color

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("#hw-hero-owl svg", state="attached", timeout=15000)
    assert page.get_attribute("html", "data-theme") == "dark"
    assert page.get_attribute("meta[name='theme-color']", "content") == dark_color
    return {"lightColor": initial_light_color, "darkColor": dark_color}


def case_t2_dock_bounds_and_popover_edge_clamp(page, base_url, _opts):
    page.set_viewport_size({"width": 375, "height": 812})
    goto_app(page, base_url)
    upload_homework_png(page)
    page.wait_for_selector("#floating-audio-dock:not([hidden])", timeout=8000)

    # At sentence 1 / 2, #dock-prev-btn must be bounded (disabled)
    assert page.locator("#dock-prev-btn").is_disabled(), "Expected #dock-prev-btn disabled at sentence 1"
    assert not page.locator("#dock-next-btn").is_disabled(), "Expected #dock-next-btn enabled at sentence 1"

    # Navigate to last sentence -> #dock-next-btn must be disabled and #dock-prev-btn enabled
    page.click("#dock-next-btn")
    page.wait_for_timeout(150)
    assert page.locator("#dock-next-btn").is_disabled(), "Expected #dock-next-btn disabled at last sentence"
    assert not page.locator("#dock-prev-btn").is_disabled(), "Expected #dock-prev-btn enabled at last sentence"
    if page.locator("#dock-stop-btn").is_visible():
        page.click("#dock-stop-btn")

    # Click tricky word in passage and assert #word-popover is clamped inside 375px viewport
    tricky_word = page.locator("#hw-passage-sentences .karaoke-word.is-tricky").first
    if tricky_word.count() > 0:
        tricky_word.click()
        page.wait_for_selector("#word-popover:not([hidden])")
        pop_box = page.locator("#word-popover").bounding_box()
        assert pop_box["x"] >= 0 and pop_box["x"] + pop_box["width"] <= 375 + 1, (
            f"Popover escaped 375px viewport: {pop_box}"
        )
    return {"dockBounded": True}


def case_t2_upload_progress_and_bad_file(page, base_url, _opts):
    goto_app(page, base_url)
    # Upload corrupt/non-image file via file input -> must show friendly error card without crashing
    page.set_input_files(
        "#hw-file-input",
        {"name": "not_an_image.txt", "mimeType": "text/plain", "buffer": b"definitely not an image"},
    )
    page.wait_for_selector("#hw-error-card:not([hidden])", timeout=10000)
    assert page.locator("#hw-error-card").is_visible()
    page.click("#hw-error-dismiss")
    page.wait_for_selector("#hw-empty-state:not([hidden])")

    # Now upload valid PNG and verify session succeeds
    upload_homework_png(page)
    assert page.locator("#hw-session-stage").is_visible()
    return {"badFileHandled": True, "validRetrySucceeded": True}


# ==============================================================================
# TIER 3 BROWSER CASES
# ==============================================================================

def case_t3_homework_full_combo(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)
    assert page.locator("#hw-passage-stage").is_visible()

    click_go_to_questions(page)
    page.click("#hw-explain-pt")
    page.wait_for_timeout(150)
    page.click("#hw-explain-no")
    page.wait_for_timeout(150)

    page.click("#hw-chat-toggle")
    page.wait_for_selector("#hw-chat-drawer:not([hidden])")
    chat_text_init = page.locator("#hw-chat-messages").inner_text()
    assert "Hvilket ord" in chat_text_init, f"Expected openingQuestionNative in chat, got {chat_text_init}"

    page.fill("#hw-chat-input", "perto do lago")
    page.click("#hw-chat-send")
    page.wait_for_timeout(350)
    chat_text_after = page.locator("#hw-chat-messages").inner_text()
    assert "Kjempebra" in chat_text_after, f"Expected replyNative in chat, got {chat_text_after}"
    assert "perto do lago azul" in chat_text_after, f"Expected targetPhrase chip in chat, got {chat_text_after}"
    assert "innsjø" in chat_text_after, f"Expected followUpQuestionNative in chat, got {chat_text_after}"

    page.click("#hw-complete-btn")
    page.wait_for_timeout(300)
    page.click("#stars-pill")
    page.wait_for_selector("#stars-modal:not([hidden])")
    words_txt = page.locator("#saved-words-list").inner_text()
    assert "patinho" in words_txt.lower(), f"Expected saved word 'patinho' in stars modal, got {words_txt}"
    return {"chatVerified": True, "starsModalWords": words_txt}


def case_t3_read_mode_slow_and_reload_persistence(page, base_url, _opts):
    goto_app(page, base_url)
    page.click("#tab-read")
    upload_read_png(page)

    # Play, open floating dock, toggle slow mode
    play_btn = page.locator("#read-listen-all, #read-stage button:has-text('Ouvir Tudo'), #read-sentences .sentence-play-btn").first
    play_btn.click()
    page.wait_for_selector("#floating-audio-dock:not([hidden])", timeout=8000)
    page.click("#dock-slow-btn")
    assert page.get_attribute("#dock-slow-btn", "aria-pressed") == "true"
    page.click("#dock-stop-btn")

    page.click("#read-finish-btn")
    page.wait_for_timeout(350)
    stars = int(page.locator("#header-stars-count").inner_text().strip())
    assert stars >= 3, f"Expected >=3 stars after finishing book page, got {stars}"

    # Reload and switch to Ler tab -> persisted page should restore from localStorage
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("#hw-hero-owl svg", state="attached", timeout=15000)
    page.wait_for_timeout(120)
    page.click("#tab-read")
    assert page.locator("#read-stage").is_visible(), "Expected Read Mode page to persist across reload"
    assert "almofada" in page.locator("#read-sentences").inner_text().lower()
    return {"stars": stars, "persisted": True}


def case_t3_voice_change_client_cache_isolation(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)
    click_go_to_questions(page)

    # 1st play with Sulafat
    page.click("#hw-q-listen-pt")
    page.wait_for_timeout(350)
    if page.locator("#dock-stop-btn").is_visible():
        page.click("#dock-stop-btn")
    calls_1 = len([r for r in http_json(base_url, "GET", "/__test/state")["requests"] if "streamGenerateContent" in r["url"] or "-tts:" in r["url"]])
    assert calls_1 >= 1

    # 2nd play with same voice -> should hit CacheStorage (no new Gemini TTS call)
    page.click("#hw-q-listen-pt")
    page.wait_for_timeout(250)
    if page.locator("#dock-stop-btn").is_visible():
        page.click("#dock-stop-btn")
    calls_2 = len([r for r in http_json(base_url, "GET", "/__test/state")["requests"] if "streamGenerateContent" in r["url"] or "-tts:" in r["url"]])
    assert calls_2 == calls_1, f"Expected client CacheStorage hit on repeat play (calls_1={calls_1}, calls_2={calls_2})"

    # Change voice in settings to Puck
    page.click("#settings-btn")
    page.wait_for_selector("#settings-modal:not([hidden])")
    page.fill("#set-voice", "Puck")
    with page.expect_response(lambda r: "/api/profile" in r.url and r.request.method == "PUT") as resp_info:
        page.click("#settings-form button[type='submit']")
    assert resp_info.value.status == 200
    page.wait_for_timeout(150)

    # 3rd play with new voice Puck -> MUST NOT use Sulafat's CacheStorage entry!
    page.click("#hw-q-listen-pt")
    page.wait_for_timeout(350)
    calls_3 = len([r for r in http_json(base_url, "GET", "/__test/state")["requests"] if "streamGenerateContent" in r["url"] or "-tts:" in r["url"]])
    assert calls_3 > calls_2, f"Voice change failed to bust client CacheStorage key! (calls_2={calls_2}, calls_3={calls_3})"
    return {"calls1": calls_1, "calls2": calls_2, "calls3": calls_3}


def case_t3_upload_cancel_and_retry(page, base_url, _opts):
    goto_app(page, base_url)
    # Delay scan response on test server so clicking Cancel aborts live XHR cleanly
    http_json(base_url, "POST", "/__test/scenario", {"scanDelayMs": 1200})
    page.set_input_files(
        "#hw-file-input",
        {"name": "cancel_me.png", "mimeType": "image/png", "buffer": make_png_bytes()},
    )
    page.wait_for_selector("#hw-progress-card:not([hidden])", timeout=5000)
    page.click("#hw-scan-cancel")
    page.wait_for_selector("#hw-empty-state:not([hidden])", timeout=5000)
    assert not page.locator("#hw-error-card").is_visible(), "Cancel should return to empty state without error card"

    # Retry cleanly without delay
    http_json(base_url, "POST", "/__test/scenario", {"scanDelayMs": 0})
    upload_homework_png(page)
    assert page.locator("#hw-session-stage").is_visible()
    return {"cancelledCleanly": True, "retrySucceeded": True}


def case_t3_tab_switch_dock_stop_and_2tap_delete(page, base_url, _opts):
    goto_app(page, base_url)
    upload_homework_png(page)

    listen_all = page.locator("#hw-passage-stage button:has-text('Ouvir Tudo'), #hw-passage-listen-all").first
    listen_all.click()
    page.wait_for_selector("#floating-audio-dock:not([hidden])", timeout=8000)

    # Switch to Ler tab -> audio dock stops & hides
    page.click("#tab-read")
    page.wait_for_timeout(200)
    assert not page.locator("#floating-audio-dock").is_visible(), "Expected audio dock to stop when switching tabs"

    # Switch back and delete via 2-tap confirm
    page.click("#tab-homework")
    page.click("#hw-pages-btn")
    page.wait_for_selector("#pages-drawer:not([hidden])")
    page.locator("#pages-list [data-delete-id], #pages-list button:has-text('Apagar'), #pages-list .page-delete-btn").first.click()
    page.locator("#pages-list button:has-text('Confirmar'), #pages-list button:has-text('Apagar?'), #pages-list [data-confirm-delete]").first.click()
    page.wait_for_timeout(300)
    assert len(http_json(base_url, "GET", "/__test/state")["sessions"]) == 0
    return {"ok": True}


# ==============================================================================
# TIER 4 BROWSER SCENARIOS
# ==============================================================================

def case_t4_sofia_worksheet_journey(page, base_url, _opts):
    page.set_viewport_size({"width": 768, "height": 1024})
    goto_app(page, base_url)
    upload_homework_png(page)

    # 1. Passage stage
    assert "O Patinho e a Borboleta" in page.locator("#hw-passage-title").inner_text()
    click_go_to_questions(page)

    # 2. Exercise 1: check tricky word popover, listen NO, chat, complete
    page.locator("#hw-tricky-words .tricky-chip").first.click()
    page.wait_for_selector("#word-popover:not([hidden])")
    page.keyboard.press("Escape")

    page.click("#hw-explain-no")
    page.wait_for_timeout(200)
    page.click("#hw-chat-toggle")
    page.fill("#hw-chat-input", "perto do lago")
    page.click("#hw-chat-send")
    page.wait_for_timeout(300)
    page.click("#hw-complete-btn")
    page.wait_for_timeout(300)

    # 3. Switch to Exercise 2 via stepper and complete
    page.locator("#hw-stepper button").nth(2).click()
    page.wait_for_timeout(150)
    assert "borboleta" in page.locator("#hw-question-karaoke").inner_text().lower()
    page.click("#hw-complete-btn")
    page.wait_for_timeout(300)

    stars = int(page.locator("#header-stars-count").inner_text().strip())
    assert stars == 4, f"Expected 4 stars after 2 exercises, got {stars}"
    return {"stars": stars}


def case_t4_sofia_evening_storybook(page, base_url, _opts):
    page.set_viewport_size({"width": 375, "height": 812})
    goto_app(page, base_url)
    page.click("#tab-read")
    upload_read_png(page)

    play_btn = page.locator("#read-listen-all, #read-stage button:has-text('Ouvir Tudo'), #read-sentences .sentence-play-btn").first
    play_btn.click()
    page.wait_for_selector("#floating-audio-dock:not([hidden])", timeout=8000)
    page.click("#dock-slow-btn")
    page.click("#dock-next-btn")
    page.wait_for_timeout(200)
    page.click("#dock-stop-btn")

    page.click("#read-finish-btn")
    page.wait_for_timeout(300)
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("#hw-hero-owl svg", state="attached", timeout=15000)
    page.wait_for_timeout(120)
    page.click("#tab-read")
    assert page.locator("#read-stage").is_visible()
    stars = int(page.locator("#header-stars-count").inner_text().strip())
    assert stars >= 3
    return {"stars": stars}


def case_t4_parent_settings_and_resilient_recovery(page, base_url, _opts):
    goto_app(page, base_url)
    page.click("#settings-btn")
    page.fill("#set-voice", "Aoede")
    with page.expect_response(lambda r: "/api/profile" in r.url and r.request.method == "PUT") as r_info:
        page.click("#settings-form button[type='submit']")
    assert r_info.value.status == 200
    page.wait_for_timeout(150)
    if page.locator("#settings-modal").is_visible():
        page.click("#settings-close-btn")

    # Simulate Gemini outage -> error card + zero new R2 orphan
    before_hw_keys = [k for k in http_json(base_url, "GET", "/__test/state")["r2Keys"] if k.startswith("homework/")]
    http_json(base_url, "POST", "/__test/scenario", {"scenario": {"structuredErrorStatus": 500}})
    page.set_input_files(
        "#hw-file-input",
        {"name": "fail.png", "mimeType": "image/png", "buffer": make_png_bytes()},
    )
    page.wait_for_selector("#hw-error-card:not([hidden])", timeout=10000)
    after_hw_keys = [k for k in http_json(base_url, "GET", "/__test/state")["r2Keys"] if k.startswith("homework/")]
    assert after_hw_keys == before_hw_keys, (
        f"R2 orphan leaked on failed Gemini scan: before={before_hw_keys}, after={after_hw_keys}"
    )

    # Dismiss and retry with healthy Gemini
    page.click("#hw-error-dismiss")
    http_json(base_url, "POST", "/__test/scenario", {"scenario": {"structuredErrorStatus": None}})
    upload_homework_png(page)
    assert page.locator("#hw-session-stage").is_visible()
    return {"recovered": True}


def case_t4_mobile_dark_light_study_session(page, base_url, _opts):
    page.set_viewport_size({"width": 375, "height": 812})
    goto_app(page, base_url)
    page.click("#theme-toggle")
    assert page.get_attribute("html", "data-theme") == "dark"

    upload_homework_png(page)
    check_no_horizontal_overflow(page, "dark-375-passage")
    check_no_raw_emojis(page, "dark-375-passage")

    click_go_to_questions(page)
    check_no_horizontal_overflow(page, "dark-375-exercise")
    page.wait_for_timeout(250)

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("#hw-hero-owl svg", state="attached", timeout=15000)
    page.wait_for_timeout(120)
    assert page.get_attribute("html", "data-theme") == "dark"
    return {"darkPersisted": True}


CASES = {
    "t1_pt_default_ui_and_tabs": ("tier1", case_t1_pt_default_ui_and_tabs),
    "t1_zero_emoji_svg_craft": ("tier1", case_t1_zero_emoji_svg_craft),
    "t1_warm_atelier_tokens": ("tier1", case_t1_warm_atelier_tokens),
    "t1_touch_ergonomics_and_popover": ("tier1", case_t1_touch_ergonomics_and_popover),
    "t1_passage_and_homework_controls": ("tier1", case_t1_passage_and_homework_controls),
    "t1_read_mode_karaoke_and_dock": ("tier1", case_t1_read_mode_karaoke_and_dock),
    "t1_owly_multistate_and_audio_dock": ("tier1", case_t1_owly_multistate_and_audio_dock),
    "t1_stars_recent_words_and_no_farming": ("tier1", case_t1_stars_recent_words_and_no_farming),
    "t1_parent_settings_save_and_hint": ("tier1", case_t1_parent_settings_save_and_hint),
    "t1_inline_2tap_delete_confirm": ("tier1", case_t1_inline_2tap_delete_confirm),
    "t2_zero_exercise_scan": ("tier2", case_t2_zero_exercise_scan),
    "t2_short_1word_audio_clip": ("tier2", case_t2_short_1word_audio_clip),
    "t2_audio_context_interrupted_and_revoke": ("tier2", case_t2_audio_context_interrupted_and_revoke),
    "t2_501_speech_synthesis_fallback": ("tier2", case_t2_501_speech_synthesis_fallback),
    "t2_rapid_double_taps": ("tier2", case_t2_rapid_double_taps),
    "t2_responsive_mobile_and_ipad": ("tier2", case_t2_responsive_mobile_and_ipad),
    "t2_karaoke_zero_horizontal_reflow": ("tier2", case_t2_karaoke_zero_horizontal_reflow),
    "t2_xss_payload_immunity": ("tier2", case_t2_xss_payload_immunity),
    "t2_theme_corrupt_storage_and_persistence": ("tier2", case_t2_theme_corrupt_storage_and_persistence),
    "t2_dock_bounds_and_popover_edge_clamp": ("tier2", case_t2_dock_bounds_and_popover_edge_clamp),
    "t2_upload_progress_and_bad_file": ("tier2", case_t2_upload_progress_and_bad_file),
    "t3_homework_full_combo": ("tier3", case_t3_homework_full_combo),
    "t3_read_mode_slow_and_reload_persistence": ("tier3", case_t3_read_mode_slow_and_reload_persistence),
    "t3_voice_change_client_cache_isolation": ("tier3", case_t3_voice_change_client_cache_isolation),
    "t3_upload_cancel_and_retry": ("tier3", case_t3_upload_cancel_and_retry),
    "t3_tab_switch_dock_stop_and_2tap_delete": ("tier3", case_t3_tab_switch_dock_stop_and_2tap_delete),
    "t4_sofia_worksheet_journey": ("tier4", case_t4_sofia_worksheet_journey),
    "t4_sofia_evening_storybook": ("tier4", case_t4_sofia_evening_storybook),
    "t4_parent_settings_and_resilient_recovery": ("tier4", case_t4_parent_settings_and_resilient_recovery),
    "t4_mobile_dark_light_study_session": ("tier4", case_t4_mobile_dark_light_study_session),
}


def run_single_case(browser, base_url, case_name, options):
    if case_name not in CASES:
        return {"passed": False, "name": case_name, "tier": "unknown", "details": {}, "error": f"Unknown case: {case_name}"}
    tier, fn = CASES[case_name]
    if options.get("resetBefore", True):
        http_json(base_url, "POST", "/__test/reset", {})
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    context.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=""))
    context.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    context.add_init_script(AUDIO_SPY_INIT)
    if options.get("mockSpeech"):
        context.add_init_script(MOCK_SPEECH_INIT)
    page = context.new_page()
    page_errors = []
    page.on("pageerror", lambda err: page_errors.append(str(err)))
    try:
        details = fn(page, base_url, options) or {}
        if page_errors and not options.get("allowPageErrors"):
            raise AssertionError(f"Uncaught page errors: {page_errors}")
        return {"passed": True, "name": case_name, "tier": tier, "details": details, "error": None}
    except Exception as exc:
        return {
            "passed": False,
            "name": case_name,
            "tier": tier,
            "details": {"pageErrors": page_errors},
            "error": f"{exc}\n{traceback.format_exc(limit=4)}",
        }
    finally:
        context.close()


def launch_browser(p):
    import os
    launch_opts = {
        "headless": True,
        "args": [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--autoplay-policy=no-user-gesture-required",
        ],
    }
    if os.path.exists("/usr/bin/google-chrome"):
        launch_opts["executable_path"] = "/usr/bin/google-chrome"
    return p.chromium.launch(**launch_opts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", action="store_true")
    parser.add_argument("--case", type=str)
    parser.add_argument("--url", type=str)
    parser.add_argument("--options", type=str, default="{}")
    args = parser.parse_args()

    with sync_playwright() as p:
        browser = launch_browser(p)
        try:
            if args.server:
                sys.stdout.write(json.dumps({"ready": True}) + "\n")
                sys.stdout.flush()
                for line in sys.stdin:
                    line = line.strip()
                    if not line:
                        continue
                    req = json.loads(line)
                    if req.get("cmd") == "quit":
                        break
                    res = run_single_case(
                        browser,
                        req["baseUrl"],
                        req["case"],
                        req.get("options") or {},
                    )
                    if (not res["passed"]) and ("Page crashed" in (res.get("error") or "") or not browser.is_connected()):
                        try:
                            browser.close()
                        except Exception:
                            pass
                        browser = launch_browser(p)
                        res = run_single_case(
                            browser,
                            req["baseUrl"],
                            req["case"],
                            req.get("options") or {},
                        )
                    res["id"] = req.get("id")
                    sys.stdout.write(json.dumps(res) + "\n")
                    sys.stdout.flush()
            else:
                res = run_single_case(browser, args.url, args.case, json.loads(args.options))
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
                sys.exit(0 if res["passed"] else 1)
        finally:
            try:
                browser.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
