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

  // Same check digits the Worker and Asaas apply (CPF 11, CNPJ 14 digits).
  function isValidDocument(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) return false;
    const nums = [...digits].map(Number);
    const checkDigit = (weights) => {
      const rest = weights.reduce((total, weight, index) => total + nums[index] * weight, 0) % 11;
      return digits.length === 11 ? (rest * 10) % 11 % 10 : rest < 2 ? 0 : 11 - rest;
    };
    if (digits.length === 11) {
      return checkDigit([10, 9, 8, 7, 6, 5, 4, 3, 2]) === nums[9]
        && checkDigit([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === nums[10];
    }
    return checkDigit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === nums[12]
      && checkDigit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === nums[13];
  }

  function checkValidity(input) {
    const filled = input.value.trim() !== "";
    input.setCustomValidity(filled && !isValidDocument(input.value) ? "CPF ou CNPJ inválido. Confira os números." : "");
  }

  document.addEventListener("input", (event) => {
    if (!event.target.matches?.("[data-document-mask]")) return;
    applyMask(event.target);
    checkValidity(event.target);
  });

  window.formatDocument = formatDocument;
  window.isValidDocument = isValidDocument;
})();
