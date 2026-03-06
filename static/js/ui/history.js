export function setupHistory(map) {
  const historyBtn = document.getElementById("historyToggle");
  const historyList = document.getElementById("historyList");

  historyBtn.addEventListener("click", () => {
    historyList.classList.toggle("hidden");
    updateHistoryListUI(map);
  });

  function updateHistoryListUI(map) {
    historyList.innerHTML = "";

    const history = JSON.parse(localStorage.getItem("weatherHistory") || "{}");
    const keys = Object.keys(history).sort().reverse();

    if (!keys.length) {
      historyList.innerHTML = "<li>No history yet</li>";
      return;
    }

    let hiddenCount = 0;

    keys.forEach((key, index) => {
      const item = history[key];

      // Auto-cleanup bad entries
      if (!item || !item.center || !Array.isArray(item.center)) {
        console.warn("Cleaning up corrupted history item:", key);
        delete history[key];
        localStorage.setItem("weatherHistory", JSON.stringify(history));
        return; // Skip rendering
      }

      const lat = item.lat ?? item.center?.[1];
      const lon = item.lon ?? item.center?.[0];
      const date = new Date(item.timestamp || key);

      const readableTime = date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });

      const label = item.placeName || (lat && lon ? `${lat.toFixed(1)}, ${lon.toFixed(1)}` : "Unknown");

      const li = document.createElement("li");
      li.className = "history-item"; // Add class for selection
      if (index >= 3) {
        li.style.display = "none";
        hiddenCount++;
      }

      li.innerHTML = `
        <span>${readableTime} — ${label}</span>
        <button class="delete-entry" title="Delete">×</button>
      `;

      // 🔁 Restore on click
      li.querySelector("span").addEventListener("click", () => {
        if (!item.center) {
          alert("❌ Location data missing.");
          return;
        }

        map.flyTo({ center: item.center, zoom: 11 });

        const image = document.getElementById("thermalImage");
        const placeholder = document.getElementById("thermalPlaceholder");
        const thermalBox = document.getElementById("thermalBox");
        const thermalHeader = document.getElementById("thermalHeader");

        if (item.imageUrl) {
          image.src = item.imageUrl;
          image.style.display = "block";
          placeholder.style.display = "none";
        } else {
          image.src = "";
          image.style.display = "none";
          placeholder.innerText = "🖱️ Click on a location to fetch data.";
          placeholder.style.display = "block";
        }

        thermalBox.classList.add("expanded");
        thermalBox.classList.remove("collapsed");
        thermalHeader.innerText = "Thermal Forecast ▼";

        const aiToggle = document.getElementById("aiToggleBtn");
        const aiOutput = document.getElementById("aiOutput");

        if (aiToggle) aiToggle.style.display = "block";
        if (aiOutput && item.aiOutput) {
          aiOutput.innerHTML = item.aiOutput;
        }

        historyList.classList.add("hidden");
      });

      // ❌ Delete logic
      li.querySelector(".delete-entry").addEventListener("click", () => {
        const updated = { ...history };
        delete updated[key];
        localStorage.setItem("weatherHistory", JSON.stringify(updated));
        updateHistoryListUI(map);
      });

      historyList.appendChild(li);
    });

    // Add Show More Button if needed
    if (hiddenCount > 0) {
      const moreLi = document.createElement("li");
      moreLi.style.textAlign = "center";
      moreLi.style.marginTop = "10px";
      moreLi.innerHTML = `<button class="modal-login-btn" style="width: auto; padding: 4px 12px; font-size: 0.8em; cursor: pointer;">Show More</button>`;
      moreLi.querySelector("button").addEventListener("click", (e) => {
        const hiddenItems = historyList.querySelectorAll('.history-item[style*="display: none"]');
        let revealed = 0;
        hiddenItems.forEach(item => {
          if (revealed < 3) {
            item.style.display = ""; // Reset display
            revealed++;
          }
        });

        // Check if any still hidden
        const remainingHidden = historyList.querySelectorAll('.history-item[style*="display: none"]');
        if (remainingHidden.length === 0) {
          moreLi.remove();
        }
      });
      historyList.appendChild(moreLi);
    }
  }
}

export async function saveToHistory(data, imageUrl) {
  const lat = data.lat ?? data.center?.[1];
  const lon = data.lon ?? data.center?.[0];
  const center = typeof lat === "number" && typeof lon === "number" ? [lon, lat] : null;

  if (!center) {
    console.warn("⚠️ Cannot save history: missing coordinates.", data);
    return;
  }

  const timestamp = new Date().toISOString();
  const history = JSON.parse(localStorage.getItem("weatherHistory") || "{}");

  const keys = Object.keys(history).sort();
  if (keys.length >= 20) {
    delete history[keys[0]]; // remove oldest
  }

  let placeName = data.placeName;
  if (!placeName && typeof window.reverseGeocode === "function") {
    try {
      placeName = await window.reverseGeocode(lat, lon);
    } catch {
      placeName = `${lat.toFixed(1)}, ${lon.toFixed(1)}`;
    }
  }

  history[timestamp] = {
    ...data,
    lat,
    lon,
    center,
    imageUrl,
    placeName,
    aiOutput: data.aiOutput || "",
    timestamp
  };

  localStorage.setItem("weatherHistory", JSON.stringify(history));
}

export function updateLatestHistory(aiText) {
  const history = JSON.parse(localStorage.getItem("weatherHistory") || "{}");
  const keys = Object.keys(history).sort(); // Sort by timestamp ascending

  if (keys.length === 0) return;

  const latestKey = keys[keys.length - 1];
  if (history[latestKey]) {
    history[latestKey].aiOutput = aiText;
    localStorage.setItem("weatherHistory", JSON.stringify(history));
  }
}
