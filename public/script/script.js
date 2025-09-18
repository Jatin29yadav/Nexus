(function () {
  "use strict";

  // Utility: safe query helper
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  // Initialization function that runs when DOM is ready
  function init() {
    console.log("[script.js] init");

    // AOS initialization (safe)
    try {
      if (window.AOS && typeof AOS.init === "function") {
        AOS.init({
          duration: 1000,
          once: true,
          offset: 100,
        });
        console.log("[script.js] AOS initialized");
      } else {
        console.warn(
          "[script.js] AOS not found - animations will be disabled."
        );
      }
    } catch (err) {
      console.error("[script.js] Error initializing AOS:", err);
    }

    // Cache DOM nodes used across handlers
    const navbar = $(".navbar");
    const menuBtn = $("#menu-btn");
    const mobileMenu = $("#mobile-menu");
    const home = $("#home");
    const footer = $("footer");

    // ---------- Scroll handling using rAF ----------

    // State used to schedule rAF
    let scrollTicking = false;
    let lastScrollY = window.scrollY || 0;

    function onScroll() {
      lastScrollY =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop;
      if (!scrollTicking) {
        scrollTicking = true;
        window.requestAnimationFrame(handleScroll);
      }
    }

    function handleScroll() {
      // Navbar scrolled class toggle
      try {
        if (navbar) {
          if (lastScrollY > 50) navbar.classList.add("scrolled");
          else navbar.classList.remove("scrolled");
        }
      } catch (err) {
        console.error("[script.js] Navbar scroll handler error:", err);
      }

      // Parallax for #home
      try {
        if (home) {
          home.style.backgroundPositionY = lastScrollY * 0.5 + "px";
        }
      } catch (err) {
        console.error("[script.js] Parallax handler error:", err);
      }

      // Footer floating elements movement
      try {
        if (footer) {
          const floatingElements = footer.querySelectorAll(".absolute");
          if (floatingElements && floatingElements.length) {
            floatingElements.forEach((element, index) => {
              const speed = 0.1 + index * 0.05;
              // Use transform translate3d for better GPU compositing
              element.style.transform =
                "translate3d(0," + lastScrollY * speed + "px,0)";
            });
          }
        }
      } catch (err) {
        console.error("[script.js] Footer animation error:", err);
      }

      scrollTicking = false;
    }

    // Attach scroll listener (passive: true for improved scrolling performance)
    try {
      window.addEventListener("scroll", onScroll, { passive: true });
    } catch (err) {
      // Older browsers may throw on options param; fallback to non-passive
      window.addEventListener("scroll", onScroll);
    }

    // Run one initial scroll handling pass in case page loaded scrolled
    handleScroll();

    // ---------- Mobile menu toggle ----------
    try {
      if (menuBtn && mobileMenu) {
        menuBtn.addEventListener("click", () => {
          mobileMenu.classList.toggle("hidden");
        });
        console.log("[script.js] mobile menu handler attached");
      } else {
        console.log(
          "[script.js] mobile menu elements not found (desktop view or different page)"
        );
      }
    } catch (err) {
      console.error("[script.js] Mobile menu handler error:", err);
    }

    // ---------- Smooth scroll for same-page anchors ----------
    try {
      // attach to anchors that contain a hash AND point to the same page
      const anchors = Array.from(document.querySelectorAll('a[href*="#"]'));
      anchors.forEach((anchor) => {
        // Build absolute URL for safe comparison
        let href;
        try {
          href = anchor.getAttribute("href");
          // Avoid javascript: links
          if (!href || href.startsWith("javascript:")) return;

          const anchorUrl = new URL(anchor.href, location.href);
          // Only handle same-page anchors (same pathname and origin) — preserves cross-page links
          if (
            anchorUrl.pathname === location.pathname &&
            anchorUrl.origin === location.origin &&
            anchorUrl.hash
          ) {
            anchor.addEventListener("click", function (e) {
              e.preventDefault();
              try {
                const hash = anchorUrl.hash;
                if (hash === "#" || !hash) {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                } else {
                  const targetEl = document.querySelector(hash);
                  if (
                    targetEl &&
                    typeof targetEl.scrollIntoView === "function"
                  ) {
                    targetEl.scrollIntoView({ behavior: "smooth" });
                  } else {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }
                if (mobileMenu) mobileMenu.classList.add("hidden");
              } catch (innerErr) {
                console.error(
                  "[script.js] Error during smooth scroll:",
                  innerErr
                );
              }
            });
          }
        } catch (urlErr) {
          // Ignore anchors with malformed hrefs
          console.warn(
            "[script.js] Skipping anchor due to URL parse error:",
            anchor
          );
        }
      });
    } catch (err) {
      console.error("[script.js] Smooth scroll setup error:", err);
    }

    // ---------- Small card hover fallback (if .game-card exists) ----------
    try {
      document.querySelectorAll(".game-card").forEach((card) => {
        card.addEventListener("mouseenter", () => {
          card.style.transform = "translateY(-10px)";
        });
        card.addEventListener("mouseleave", () => {
          card.style.transform = "translateY(0)";
        });
      });
    } catch (err) {
      console.error("[script.js] game-card hover handler error:", err);
    }

    console.log("[script.js] ready");
  } // end init()

  // Run init when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // DOM already ready
    init();
  }
})();

// Password Match Validation
try {
  const form = document.querySelector("form[action='/register']");
  if (form) {
    form.addEventListener("submit", function (e) {
      const password = document.getElementById("password").value;
      const confirmPassword = document.getElementById("confirmPassword").value;

      if (password !== confirmPassword) {
        e.preventDefault(); // stop form from submitting
        alert("Passwords do not match. Please re-enter.");
      }
    });
  }
} catch (err) {
  console.error("Password match validation error:", err);
}
