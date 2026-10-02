// CPF/CNPJ mask for inputs marked with data-document-mask.
// Formats while typing; the Worker still receives and validates only digits.
(function () {
  const CPF = { sizes: [3, 3, 3, 2], separators: [".", ".", "-"] };
  const CNPJ = { sizes: [2, 3, 3, 4, 2], separators: [".", ".", "/", "-"] };

  function formatDocument(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
    const { sizes, separators } = digits.length > 11 ? CNPJ : CPF;
    let output = "";
    let start = 0;
    sizes.forEach((size, index) => {
      const part = digits.slice(start, start + size);
      start += size;
      if (!part) return;
      output += (index ? separators[index - 1] : "") + part;
    });
    return output;
  }

  function applyMask(input) {
    const caret = input.selectionStart ?? input.value.length;
    const digitsBefore = input.value.slice(0, caret).replace(/\D/g, "").length;
    const formatted = formatDocument(input.value);
    if (formatted === input.value) return;
    input.value = formatted;
    if (document.activeElement !== input) return;
    let position = 0;
    for (let seen = 0; position < formatted.length && seen < digitsBefore; position += 1) {
      if (/\d/.test(formatted[position])) seen += 1;
    }
    input.setSelectionRange(position, position);
  }

  document.addEventListener("input", (event) => {
    if (event.target.matches?.("[data-document-mask]")) applyMask(event.target);
  });

  window.formatDocument = formatDocument;
})();
