import confetti from "canvas-confetti";

// Küçük kutlama: ticket açmadan çözülen sorun, çözülen büyük olay gibi anlarda.
// "Hareketi azalt" tercih edilmişse animasyon yapılmaz.
export function celebrate(strength: "small" | "big" = "small") {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const base = { spread: 70, startVelocity: 38, ticks: 180, zIndex: 2000, colors: ["#36b37e", "#0c66e4", "#f5a623", "#ff5630", "#6554c0"] };
    confetti({ ...base, particleCount: strength === "big" ? 140 : 80, origin: { y: 0.65 } });
    if (strength === "big")
      setTimeout(() => {
        confetti({ ...base, particleCount: 60, angle: 60, origin: { x: 0, y: 0.7 } });
        confetti({ ...base, particleCount: 60, angle: 120, origin: { x: 1, y: 0.7 } });
      }, 250);
  } catch { /* süs; hata vermesin */ }
}
