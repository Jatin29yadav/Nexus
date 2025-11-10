document.addEventListener("DOMContentLoaded", () => {
  const bookingForm = document.querySelector(
    "form[action='/booking'], form[action='/api/bookings']"
  );
  if (!bookingForm) return;

  bookingForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());

    // convert bookingTime fields if present
    data.bookingTime = {
      start: data["bookingTime[start]"],
      end: data["bookingTime[end]"],
    };
    delete data["bookingTime[start]"];
    delete data["bookingTime[end]"];

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      const flash = document.createElement("div");
      flash.className = `flash-message fixed top-20 left-1/2 -translate-x-1/2 max-w-xl w-full mx-auto flex items-center justify-between rounded-lg px-4 py-3 shadow z-50 ${
        result.flashType === "success"
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      }`;
      flash.innerHTML = `
        <span>${result.message}</span>
        <button class="ml-3 font-bold" onclick="this.parentElement.remove()">✕</button>
      `;

      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 4000);

      if (result.success) this.reset();
    } catch (error) {
      console.error("Booking error:", error);
      alert("Something went wrong. Please try again.");
    }
  });
});
