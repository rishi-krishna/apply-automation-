(function () {
  const LOG_PREFIX = "[EasyApplyAssistant]";
  let isRunning = false;
  let appliedCount = 0;
  let processedCount = 0;
  let activeRunToken = 0;
  const processedJobIds = new Set();
  const debugLogs = [];

  function debugLog(message, meta) {
    const line = `${new Date().toISOString()} ${message}`;
    const entry = meta ? `${line} ${JSON.stringify(meta)}` : line;
    debugLogs.push(entry);
    if (debugLogs.length > 500) {
      debugLogs.shift();
    }
    if (meta !== undefined) {
      console.log(LOG_PREFIX, message, meta);
    } else {
      console.log(LOG_PREFIX, message);
    }
  }

  // Expose logs for quick copy from DevTools console.
  window.__EASYAPPLY_LOGS__ = debugLogs;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function visible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").trim().toLowerCase();
  }

  function normalizeText(value) {
    return (value || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPlaceholderText(text) {
    const t = normalizeText(text);
    return t === "select an option" || t === "choose an option" || t === "please select";
  }

  function extractLikelyQuestionFromText(rawText) {
    if (!rawText) return "";
    const lines = rawText
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    for (const line of lines) {
      const n = normalizeText(line);
      if (!n) continue;
      if (isPlaceholderText(n)) continue;
      if (n === "yes" || n === "no" || n === "none" || n === "professional" || n === "conversational") continue;
      if (line.includes("?") || n.includes("years of experience") || n.includes("proficiency")) {
        return line.toLowerCase();
      }
    }
    return (lines[0] || "").toLowerCase();
  }

  function getJobId(card) {
    const attr = card?.getAttribute("data-occludable-job-id");
    if (attr) return attr;
    const href = card?.querySelector("a")?.getAttribute("href") || "";
    const match = href.match(/\/jobs\/view\/(\d+)/);
    return match ? match[1] : href || Math.random().toString(36).slice(2);
  }

  function setInput(el, value, blur = true) {
    if (!el || value == null || value === "") return;
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (blur) {
      el.blur();
    }
  }

  function pressKey(el, key) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  }

  function isLocationQuestion(questionText) {
    const q = normalizeText(questionText);
    return q.includes("location city") || q.includes("city") || q.includes("location");
  }

  function isTypeaheadInput(el) {
    if (!el) return false;
    const role = (el.getAttribute("role") || "").toLowerCase();
    const ariaAutocomplete = (el.getAttribute("aria-autocomplete") || "").toLowerCase();
    const list = el.getAttribute("list");
    return role === "combobox" || ariaAutocomplete === "list" || Boolean(list);
  }

  function pickBestOption(options, answer) {
    const normalizedAnswer = normalizeText(answer);
    const valid = options.filter((o) => {
      const t = normalizeText(o.innerText || o.textContent || "");
      return t && !t.includes("select an option");
    });
    const direct =
      valid.find((o) => normalizeText(o.innerText || o.textContent || "") === normalizedAnswer) ||
      valid.find((o) => normalizeText(o.innerText || o.textContent || "").startsWith(normalizedAnswer)) ||
      valid.find((o) => normalizeText(o.innerText || o.textContent || "").includes(normalizedAnswer));
    if (direct) return direct;

    if (normalizedAnswer === "yes") {
      return (
        valid.find((o) => {
          const t = normalizeText(o.innerText || o.textContent || "");
          return t === "yes" || t.startsWith("yes") || t.includes(" i can ") || t.includes("able") || t.includes("willing");
        }) || valid[0] || null
      );
    }

    if (normalizedAnswer === "no") {
      return (
        valid.find((o) => {
          const t = normalizeText(o.innerText || o.textContent || "");
          return t === "no" || t.startsWith("no") || t.includes("not");
        }) || null
      );
    }

    if (normalizedAnswer === "professional") {
      return valid.find((o) => normalizeText(o.innerText || o.textContent || "").includes("professional")) || null;
    }

    if (normalizedAnswer === "5") {
      return (
        valid.find((o) => /\b5(\+|\.0)?\b/.test(normalizeText(o.innerText || o.textContent || ""))) ||
        valid.find((o) => normalizeText(o.innerText || o.textContent || "").includes("5+")) ||
        null
      );
    }

    return null;
  }

  async function selectTypeaheadOption(inputEl, answer) {
    debugLog("selectTypeaheadOption start", { answer, question: findQuestionText(inputEl) });
    setInput(inputEl, answer, false);
    await wait(300);

    const root = inputEl.closest(".artdeco-modal") || document;
    const options = Array.from(
      root.querySelectorAll(
        'li[role="option"], div[role="option"], .basic-typeahead__selectable, [id*="typeahead"] li'
      )
    ).filter((el) => visible(el));

    if (options.length > 0) {
      const normalizedAnswer = normalizeText(answer);
      let best =
        options.find((o) => normalizeText(o.innerText) === normalizedAnswer) ||
        options.find((o) => normalizeText(o.innerText).startsWith(normalizedAnswer)) ||
        options.find((o) => normalizeText(o.innerText).includes(normalizedAnswer)) ||
        options[0];

      if (best) {
        debugLog("selectTypeaheadOption picked option", { picked: (best.innerText || "").trim() });
        best.click();
        await wait(150);
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        inputEl.blur();
        return true;
      }
    }

    // If this is a plain text field (no combobox/list behavior), keep typed value.
    if (!isTypeaheadInput(inputEl)) {
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      inputEl.blur();
      debugLog("selectTypeaheadOption plain input fallback used");
      return true;
    }

    // Fallback for keyboard-driven comboboxes.
    pressKey(inputEl, "ArrowDown");
    await wait(120);
    pressKey(inputEl, "Enter");
    await wait(120);
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.blur();
    debugLog("selectTypeaheadOption fallback keyboard used");
    return true;
  }

  function getQuestionFromGroup(group) {
    const label =
      group.querySelector("legend") ||
      group.querySelector("label") ||
      group.querySelector(".fb-dash-form-element__label") ||
      group.querySelector(".jobs-easy-apply-form-section__group-title");
    const explicit = normalizeText(label?.innerText || "");
    if (explicit) return explicit;
    return normalizeText(extractLikelyQuestionFromText(group.innerText || ""));
  }

  function getDropdownTrigger(group) {
    const candidates = Array.from(
      group.querySelectorAll(
        '[role="combobox"]:not(input), button[aria-haspopup="listbox"], button[aria-expanded], [data-test-form-builder-dropdown-select], .artdeco-dropdown__trigger, [tabindex="0"]'
      )
    ).filter((el) => visible(el));
    if (candidates.length === 0) return null;

    const placeholderCandidate = candidates.find((el) => {
      const t = normalizeText(el.innerText || el.textContent || el.getAttribute("value") || "");
      return isPlaceholderText(t);
    });
    return placeholderCandidate || candidates[0];
  }

  function getDropdownTriggerCandidates(group) {
    return Array.from(
      group.querySelectorAll(
        '[role="combobox"]:not(input), button[aria-haspopup="listbox"], button[aria-expanded], [data-test-form-builder-dropdown-select], .artdeco-dropdown__trigger, [tabindex="0"]'
      )
    ).filter((el) => visible(el));
  }

  function robustClick(el) {
    if (!el) return;
    el.focus();
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function openDropdownFromTrigger(trigger) {
    if (!trigger) return;
    const targets = [];
    targets.push(trigger);
    if (trigger.parentElement) targets.push(trigger.parentElement);
    targets.push(...Array.from(trigger.querySelectorAll("svg, path, span, i")).slice(0, 6));
    const unique = Array.from(new Set(targets)).filter((el) => visible(el));
    for (const t of unique) {
      robustClick(t);
    }
    trigger.focus();
    pressKey(trigger, " ");
    pressKey(trigger, "Enter");
    pressKey(trigger, "ArrowDown");
  }

  function groupNeedsDropdownAnswer(group) {
    const hasInvalid = Boolean(group.querySelector('[aria-invalid="true"]')) || /please enter a valid answer/i.test(group.innerText || "");
    const trigger = getDropdownTrigger(group);
    if (!trigger) return hasInvalid;
    const t = normalizeText(trigger.innerText || trigger.textContent || trigger.getAttribute("value") || "");
    return hasInvalid || isPlaceholderText(t);
  }

  function isGroupResolved(group) {
    const hasInvalid = Boolean(group.querySelector('[aria-invalid="true"]')) || /please enter a valid answer/i.test(group.innerText || "");
    const trigger = getDropdownTrigger(group);
    if (!trigger) return !hasInvalid;
    const t = normalizeText(trigger.innerText || trigger.textContent || trigger.getAttribute("value") || "");
    return !hasInvalid && !isPlaceholderText(t);
  }

  function nearestElement(baseEl, elements) {
    if (!baseEl || elements.length === 0) return null;
    const baseRect = baseEl.getBoundingClientRect();
    const bx = baseRect.left + baseRect.width / 2;
    const by = baseRect.top + baseRect.height / 2;
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const dist = Math.hypot(ex - bx, ey - by);
      if (dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    }
    return best;
  }

  function findGlobalOptionNearTrigger(trigger, answer) {
    const normalizedAnswer = normalizeText(answer);
    const all = Array.from(document.querySelectorAll("li, div, span, button, [role='option']"))
      .filter((el) => visible(el))
      .filter((el) => {
        const t = normalizeText(el.innerText || el.textContent || "");
        if (!t || t.length > 80) return false;
        if (isPlaceholderText(t)) return false;
        return true;
      });

    const baseRect = trigger.getBoundingClientRect();
    const nearby = all.filter((el) => {
      const r = el.getBoundingClientRect();
      const closeY = Math.abs(r.top - baseRect.bottom) < 420;
      const closeX = Math.abs(r.left - baseRect.left) < 420;
      return closeY && closeX;
    });

    const pool = nearby.length > 0 ? nearby : all;
    const matched =
      pool.find((el) => normalizeText(el.innerText || el.textContent || "") === normalizedAnswer) ||
      pool.find((el) => normalizeText(el.innerText || el.textContent || "").startsWith(normalizedAnswer)) ||
      pool.find((el) => normalizeText(el.innerText || el.textContent || "").includes(normalizedAnswer));

    if (matched) return matched;
    if (normalizedAnswer === "yes") {
      return pool.find((el) => normalizeText(el.innerText || el.textContent || "") === "yes") || null;
    }
    if (normalizedAnswer === "no") {
      return pool.find((el) => normalizeText(el.innerText || el.textContent || "") === "no") || null;
    }
    return null;
  }

  async function selectListboxDropdownInGroup(group, answer) {
    const primaryTrigger = getDropdownTrigger(group);
    if (!primaryTrigger || !visible(primaryTrigger)) return false;
    debugLog("selectListboxDropdownInGroup start", {
      question: getQuestionFromGroup(group),
      answer,
      triggerText: normalizeText(primaryTrigger.innerText || primaryTrigger.textContent || primaryTrigger.getAttribute("value") || "")
    });

    const candidates = [primaryTrigger, ...getDropdownTriggerCandidates(group).filter((x) => x !== primaryTrigger)];
    for (const trigger of candidates) {
      const beforeVisibleListboxes = Array.from(document.querySelectorAll('[role="listbox"]'))
        .filter((lb) => visible(lb))
        .map((lb) => lb.id)
        .filter(Boolean);

      openDropdownFromTrigger(trigger);
      await wait(350);

      const controlsId = trigger.getAttribute("aria-controls");
      const openListboxes = Array.from(document.querySelectorAll('[role="listbox"]')).filter((lb) => visible(lb));
      let options = [];

      let targetListbox = controlsId ? document.getElementById(controlsId) : null;
      if (!targetListbox || !visible(targetListbox)) {
        const newListboxes = openListboxes.filter((lb) => lb.id && !beforeVisibleListboxes.includes(lb.id));
        targetListbox = nearestElement(trigger, newListboxes.length > 0 ? newListboxes : openListboxes);
      }

      if (targetListbox && visible(targetListbox)) {
        options.push(
          ...Array.from(targetListbox.querySelectorAll('[role="option"], li, div[role="option"], button[role="option"], button')).filter((o) =>
            visible(o)
          )
        );
      }

      if (options.length === 0) {
        for (const lb of openListboxes) {
          options.push(
            ...Array.from(lb.querySelectorAll('[role="option"], li, div[role="option"], button[role="option"], button')).filter((o) => visible(o))
          );
        }
      }

      if (options.length === 0) {
        options = Array.from(
          document.querySelectorAll('[role="option"], li[role="option"], .artdeco-typeahead__result, li')
        ).filter((o) => visible(o));
      }

      const uniqueOptions = Array.from(new Set(options));
      debugLog("selectListboxDropdownInGroup options found", {
        count: uniqueOptions.length,
        sample: uniqueOptions.slice(0, 6).map((o) => normalizeText(o.innerText || o.textContent || ""))
      });
      const best = pickBestOption(uniqueOptions, answer);
      if (best && !isPlaceholderText(best.innerText || best.textContent || "")) {
        debugLog("selectListboxDropdownInGroup picked option", { picked: normalizeText(best.innerText || best.textContent || "") });
        robustClick(best);
        await wait(180);
        trigger.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // Fallback for custom rendered dropdowns with missing ARIA roles.
        const globalBest = findGlobalOptionNearTrigger(trigger, answer);
        if (globalBest) {
          debugLog("selectListboxDropdownInGroup global fallback picked option", {
            picked: normalizeText(globalBest.innerText || globalBest.textContent || "")
          });
          robustClick(globalBest);
          await wait(180);
          trigger.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          // Final keyboard fallback for stubborn controls.
          trigger.focus();
          pressKey(trigger, "ArrowDown");
          await wait(120);
          if (normalizeText(answer) === "no") {
            pressKey(trigger, "ArrowDown");
            await wait(80);
          }
          pressKey(trigger, "Enter");
          await wait(120);
          trigger.dispatchEvent(new Event("change", { bubbles: true }));
          debugLog("selectListboxDropdownInGroup final keyboard fallback used", { answer });
        }
      }

      if (isGroupResolved(group)) {
        return true;
      }
    }

    debugLog("selectListboxDropdownInGroup failed to resolve group", { answer });
    return false;
  }

  function parseCustomAnswers(config) {
    if (!config.customAnswers) return {};
    try {
      return JSON.parse(config.customAnswers);
    } catch {
      return {};
    }
  }

  function findQuestionText(fieldEl) {
    const parent = fieldEl.closest(".fb-dash-form-element, .jobs-easy-apply-form-section__grouping, .artdeco-form-field");
    const labelEl =
      parent?.querySelector("label") ||
      parent?.querySelector(".fb-dash-form-element__label") ||
      fieldEl.closest("label");
    const labelText = (labelEl?.innerText || "").trim();
    if (labelText) return labelText.toLowerCase();

    const labelledBy = fieldEl.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      const linkedText = ids
        .map((id) => document.getElementById(id)?.innerText || "")
        .join(" ")
        .trim();
      if (linkedText) return linkedText.toLowerCase();
    }

    const inferred = parent ? extractLikelyQuestionFromText(parent.innerText || "") : "";
    if (inferred) return inferred.toLowerCase();

    const aria = fieldEl.getAttribute("aria-label") || "";
    const placeholder = fieldEl.getAttribute("placeholder") || "";
    return `${aria} ${placeholder}`.trim().toLowerCase();
  }

  function selectNativeSelectOption(selectEl, answer) {
    const options = Array.from(selectEl.options || []);
    if (options.length === 0) return false;

    const normalizedAnswer = normalizeText(answer);
    let match =
      options.find((o) => normalizeText(o.text) === normalizedAnswer) ||
      options.find((o) => normalizeText(o.text).startsWith(normalizedAnswer)) ||
      options.find((o) => normalizeText(o.text).includes(normalizedAnswer));

    if (!match && normalizedAnswer.includes("yes")) {
      match = options.find((o) => normalizeText(o.text) === "yes");
    }
    if (!match && normalizedAnswer.includes("no")) {
      match = options.find((o) => normalizeText(o.text) === "no");
    }
    if (!match && normalizedAnswer === "professional") {
      match = options.find((o) => normalizeText(o.text).includes("professional"));
    }

    if (!match && normalizedAnswer === "yes") {
      match = options.find((o) => !isPlaceholderText(o.text));
    }

    if (!match || isPlaceholderText(match.text)) return false;
    debugLog("selectNativeSelectOption picked option", {
      question: findQuestionText(selectEl),
      answer,
      picked: normalizeText(match.text)
    });
    selectEl.value = match.value;
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    selectEl.blur();
    return true;
  }

  function valueForQuestion(question, config, custom) {
    const q = question.toLowerCase();
    const normalizedQ = normalizeText(q);
    for (const key of Object.keys(custom)) {
      if (normalizeText(key) === normalizedQ) return custom[key];
    }

    // User-configured global policy:
    // - citizenship / green card questions => No
    // - years of experience questions => 5
    // - most other option-style questions => Yes
    if (
      normalizedQ.includes("green card") ||
      normalizedQ.includes("us citizen") ||
      normalizedQ.includes("u s citizen") ||
      normalizedQ.includes("u.s. citizen") ||
      normalizedQ.includes("citizenship") ||
      normalizedQ.includes("permanent resident")
    ) {
      return "No";
    }

    // Security clearance questions should always be answered No.
    if (
      normalizedQ.includes("security clearance") ||
      normalizedQ.includes("security clearence") ||
      normalizedQ.includes("active clearance") ||
      normalizedQ.includes("secret clearance") ||
      normalizedQ.includes("top secret")
    ) {
      return "No";
    }

    // Sponsorship questions are typically Yes/No dropdowns.
    // Must run before generic work authorization mapping.
    if (
      normalizedQ.includes("require sponsorship") ||
      normalizedQ.includes("require visa sponsorship") ||
      normalizedQ.includes("sponsorship for employment visa") ||
      normalizedQ.includes("need sponsorship")
    ) {
      return "Yes";
    }

    const map = [
      { keys: ["full name", "name"], value: config.fullName },
      { keys: ["email"], value: config.email },
      { keys: ["phone", "mobile"], value: config.phone },
      { keys: ["location city", "city"], value: config.city },
      { keys: ["linkedin"], value: config.linkedinUrl },
      { keys: ["portfolio", "website", "github"], value: config.portfolioUrl },
      { keys: ["years of experience", "year of experience", "how many years"], value: config.yearsExperience },
      { keys: ["current ctc", "current salary"], value: config.currentSalary },
      { keys: ["expected ctc", "expected salary", "salary expectation"], value: config.expectedSalary },
      { keys: ["notice period", "joining"], value: config.noticePeriod },
      { keys: ["work authorization", "authorized", "visa status"], value: config.workAuthorization },
      { keys: ["disability", "disabled", "impairment"], value: config.disabilityStatus },
      { keys: ["gender", "sex"], value: config.gender },
      { keys: ["race", "ethnicity", "hispanic", "latino"], value: config.raceEthnicity },
      { keys: ["veteran", "protected veteran", "military"], value: config.veteranStatus },
      { keys: ["english proficiency", "level of proficiency in english", "proficiency in english"], value: "Professional" },
      {
        keys: [
          "comfortable commuting",
          "commute to this job s location",
          "commute",
          "5 days onsite",
          "onsite",
          "on site",
          "hybrid",
          "remote",
          "work from office",
          "work from home",
          "relocate",
          "relocation"
        ],
        value: "Yes"
      }
    ];

    for (const item of map) {
      if (item.keys.some((k) => q.includes(k)) && item.value) {
        return item.value;
      }
    }

    if (
      normalizedQ.includes("how many years") ||
      normalizedQ.includes("years of experience") ||
      normalizedQ.includes("year of experience")
    ) {
      return "5";
    }

    if (normalizedQ.startsWith("do you have experience") || normalizedQ.includes("experience building")) {
      return "Yes";
    }

    // Broad fallback for binary/option questions.
    if (
      normalizedQ.startsWith("are you") ||
      normalizedQ.startsWith("do you") ||
      normalizedQ.startsWith("would you") ||
      normalizedQ.startsWith("will you") ||
      normalizedQ.startsWith("can you") ||
      normalizedQ.includes("onsite") ||
      normalizedQ.includes("on site") ||
      normalizedQ.includes("hybrid") ||
      normalizedQ.includes("remote") ||
      normalizedQ.includes("relocate") ||
      normalizedQ.includes("commute")
    ) {
      return "Yes";
    }
    return "";
  }

  function maybeSelectRadio(config, custom) {
    const groups = document.querySelectorAll('fieldset[data-test-form-builder-radio-button-form-component="true"], fieldset');
    for (const group of groups) {
      if (!visible(group)) continue;
      const q = textOf(group);
      if (!q) continue;

      const answer = (custom[q] || valueForQuestion(q, config, custom) || "").toString().toLowerCase();
      if (!answer) continue;

      const labels = group.querySelectorAll("label");
      const normalizedAnswer = normalizeText(answer);
      for (const label of labels) {
        const t = textOf(label);
        const normalizedOption = normalizeText(t);
        if (!normalizedOption) continue;

        if (normalizedAnswer === normalizedOption || normalizedAnswer.includes(normalizedOption) || normalizedOption.includes(normalizedAnswer)) {
          label.click();
          break;
        }
        if (normalizedAnswer.includes("yes") && normalizedOption.includes("yes")) {
          label.click();
          break;
        }
        if (normalizedAnswer.includes("no") && normalizedOption.includes("no")) {
          label.click();
          break;
        }
      }
    }
  }

  async function fillVisibleFormFields(config) {
    const custom = parseCustomAnswers(config);
    const root = document.querySelector(".jobs-easy-apply-content, .artdeco-modal");
    if (!root) return;

    const inputs = root.querySelectorAll("input, textarea, select");
    for (const el of inputs) {
      if (!visible(el)) continue;

      if (el.tagName === "SELECT") {
        const q = findQuestionText(el);
        let answer = valueForQuestion(q, config, custom);
        const optionsText = Array.from(el.options || []).map((o) => normalizeText(o.text));
        if (!answer && optionsText.includes("yes") && optionsText.includes("no")) {
          answer = "Yes";
        }
        if (!answer && q.includes("english") && optionsText.some((t) => t.includes("professional"))) {
          answer = "Professional";
        }
        if (!answer) continue;
        debugLog("fillVisibleFormFields native select answer", { question: q, answer });
        selectNativeSelectOption(el, answer);
        continue;
      }

      if (el.type === "checkbox" || el.type === "radio" || el.type === "file") continue;

      const q = findQuestionText(el);
      const isLocationField = isLocationQuestion(q);
      const isInvalid = el.getAttribute("aria-invalid") === "true";
      if (!isLocationField && !isInvalid && el.value && el.value.trim() !== "") continue;

      const answer = valueForQuestion(q, config, custom);
      if (!answer) continue;
      debugLog("fillVisibleFormFields input answer", { question: q, answer });

      if (isLocationField) {
        await selectTypeaheadOption(el, answer);
        continue;
      }

      if (isTypeaheadInput(el)) {
        await selectTypeaheadOption(el, answer);
        continue;
      }

      setInput(el, answer);
    }

    // Handle LinkedIn button/listbox dropdowns that are not input/select fields.
    const groups = root.querySelectorAll(".fb-dash-form-element, .jobs-easy-apply-form-section__grouping, .artdeco-form-field");
    for (const group of groups) {
      if (!visible(group)) continue;
      if (!groupNeedsDropdownAnswer(group)) continue;
      const question = getQuestionFromGroup(group);
      if (!question) continue;
      const answer = valueForQuestion(question, config, custom);
      if (!answer) continue;
      debugLog("fillVisibleFormFields listbox answer", { question, answer });
      await selectListboxDropdownInGroup(group, answer);
    }

    // Retry only invalid groups to clear "Please enter a valid answer" blockers.
    for (const group of groups) {
      if (!visible(group)) continue;
      const hasInvalid = Boolean(group.querySelector('[aria-invalid="true"]')) || /please enter a valid answer/i.test(group.innerText || "");
      if (!hasInvalid) continue;
      const question = getQuestionFromGroup(group) || extractLikelyQuestionFromText(group.innerText || "");
      let answer = valueForQuestion(question, config, custom);
      if (!answer) {
        // Required dropdown fallback policy from user rules.
        answer = "Yes";
      }
      debugLog("fillVisibleFormFields retry invalid group", { question, answer });
      await selectListboxDropdownInGroup(group, answer);
    }

    maybeSelectRadio(config, custom);
  }

  function getActiveEasyApplyModal() {
    const modals = Array.from(document.querySelectorAll(".artdeco-modal")).filter((m) => visible(m));
    const easyModal = modals.find((m) => m.querySelector(".jobs-easy-apply-content"));
    return easyModal || modals[0] || null;
  }

  function findButtonByText(texts, root = document) {
    const buttons = root.querySelectorAll("button");
    for (const b of buttons) {
      if (!visible(b)) continue;
      if (b.disabled) continue;
      const t = textOf(b);
      if (texts.some((x) => t === x || t.includes(x))) return b;
    }
    return null;
  }

  function isEasyApplyModalOpen() {
    return Boolean(getActiveEasyApplyModal());
  }

  function hasUnresolvedInvalidFields() {
    const modal = document.querySelector(".jobs-easy-apply-content, .artdeco-modal") || document;
    const invalidByAttr = Array.from(modal.querySelectorAll('[aria-invalid="true"]')).some((el) => visible(el));
    const invalidByText = Array.from(modal.querySelectorAll("*")).some((el) => {
      if (!visible(el)) return false;
      const t = normalizeText(el.innerText || "");
      return t.includes("please enter a valid answer");
    });
    return Boolean(invalidByAttr || invalidByText);
  }

  async function closeApplicationModal() {
    const modal = getActiveEasyApplyModal() || document;
    const dismiss = findButtonByText(["dismiss", "cancel"], modal);
    if (dismiss) {
      dismiss.click();
      await wait(500);
      const discard = findButtonByText(["discard", "discard application"], document);
      if (discard) discard.click();
      await wait(600);
    }
  }

  async function completeCurrentApplication(config) {
    let stepGuard = 0;
    while (isRunning && stepGuard < 12) {
      stepGuard += 1;
      await fillVisibleFormFields(config);
      await wait(500);

      const modal = getActiveEasyApplyModal() || document;
      const actionbar = modal.querySelector(".artdeco-modal__actionbar") || modal;

      const submitBtn = findButtonByText(["submit application"], actionbar) || findButtonByText(["submit application"], modal);
      if (submitBtn) {
        debugLog("completeCurrentApplication reached submit step", { autoSubmit: Boolean(config.autoSubmit) });
        if (config.autoSubmit) {
          submitBtn.click();
          appliedCount += 1;
          await wait(1500);
          const done = findButtonByText(["done"], modal) || findButtonByText(["done"], document);
          if (done) done.click();
        }
        return true;
      }

      const nextBtn = findButtonByText(["next", "review"], actionbar) || findButtonByText(["next", "review"], modal);
      if (nextBtn) {
        if (hasUnresolvedInvalidFields()) {
          debugLog("completeCurrentApplication unresolved invalid fields before next");
          await fillVisibleFormFields(config);
          await wait(350);
        }
        debugLog("completeCurrentApplication clicking next/review");
        nextBtn.click();
        await wait(1000);
        continue;
      }

      debugLog("completeCurrentApplication no next/submit button found; blocked");
      return "blocked";
    }
    debugLog("completeCurrentApplication step guard exceeded; blocked");
    return "blocked";
  }

  async function maybeOpenEasyApply() {
    const easyApplyButton = document.querySelector("button.jobs-apply-button");
    if (!easyApplyButton || !visible(easyApplyButton)) return false;
    const txt = textOf(easyApplyButton);
    if (!txt.includes("easy apply")) return false;
    easyApplyButton.click();
    await wait(1500);
    return true;
  }

  async function clickNextEasyApplyJobCard() {
    const cards = document.querySelectorAll(".scaffold-layout__list-item, .jobs-search-results__list-item");
    for (const card of cards) {
      if (!visible(card)) continue;
      const id = getJobId(card);
      if (processedJobIds.has(id)) continue;
      processedJobIds.add(id);

      const easyBadge = Array.from(card.querySelectorAll("*")).some((el) => textOf(el).includes("easy apply"));
      if (!easyBadge) continue;

      // Avoid generic anchor clicks that can trigger full page navigation/reload.
      const safeLink =
        card.querySelector('a.job-card-list__title[href*="/jobs/view/"]') ||
        card.querySelector('a.job-card-container__link[href*="/jobs/view/"]') ||
        card.querySelector('a[href*="/jobs/view/"]');
      if (safeLink) {
        safeLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      } else {
        const clickableCard =
          card.querySelector(".job-card-container--clickable") ||
          card.querySelector(".job-card-container") ||
          card;
        clickableCard.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
      await wait(1800);
      return true;
    }
    return false;
  }

  async function scrollJobsList() {
    const list =
      document.querySelector(".jobs-search-results-list") ||
      document.querySelector(".scaffold-layout__list-container");
    if (list) {
      list.scrollBy(0, 900);
    } else {
      window.scrollBy(0, 900);
    }
    await wait(1200);
  }

  async function run(config) {
    if (isRunning) return;
    activeRunToken += 1;
    const runToken = activeRunToken;
    isRunning = true;
    appliedCount = 0;
    processedCount = 0;
    processedJobIds.clear();

    const maxApps = Number(config.maxApplications || 10);
    debugLog("run started", { maxApps, autoSubmit: Boolean(config.autoSubmit) });
    while (isRunning && runToken === activeRunToken && processedCount < maxApps) {
      if (isEasyApplyModalOpen()) {
        const modalResult = await completeCurrentApplication(config);
        if (modalResult === true) {
          processedCount += 1;
          await closeApplicationModal();
          await wait(800);
          continue;
        }
        if (modalResult === "blocked") {
          isRunning = false;
          return;
        }
      }

      const hasJob = await clickNextEasyApplyJobCard();
      if (!hasJob) {
        debugLog("run no easy-apply card found, scrolling");
        await scrollJobsList();
        continue;
      }

      const opened = await maybeOpenEasyApply();
      if (!opened) {
        debugLog("run could not open easy apply on selected job");
        continue;
      }

      const completed = await completeCurrentApplication(config);
      if (completed === true) {
        processedCount += 1;
        debugLog("run application step completed", { processedCount, maxApps });
        await closeApplicationModal();
        await wait(1200);
        continue;
      }

      if (completed === "blocked") {
        debugLog("run blocked on current application");
        isRunning = false;
        return;
      }
    }

    debugLog("run finished", { processedCount, appliedCount });
    isRunning = false;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START_AUTOMATION") {
      run(msg.config || {}).catch((err) => {
        console.error("[EasyApplyAssistant] automation error", err);
        isRunning = false;
      });
    }
    if (msg.type === "STOP_AUTOMATION") {
      isRunning = false;
      activeRunToken += 1;
    }
  });
})();
