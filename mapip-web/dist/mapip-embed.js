(function () {
  function buildSrc(baseUrl) {
    var cleanBase = String(baseUrl || "").replace(/\/+$/, "");
    return cleanBase + "/embed/router";
  }

  function mount(node) {
    var baseUrl = node.getAttribute("data-base-url");
    if (!baseUrl) return;
    var width = node.getAttribute("data-width") || "100%";
    var height = node.getAttribute("data-height") || "640";
    var title = node.getAttribute("data-title") || "MAPIP embed";

    var iframe = document.createElement("iframe");
    iframe.src = buildSrc(baseUrl);
    iframe.title = title;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.style.width = width;
    iframe.style.height = /^\d+$/.test(height) ? height + "px" : height;
    iframe.style.border = "0";
    iframe.style.borderRadius = "12px";
    node.innerHTML = "";
    node.appendChild(iframe);
  }

  function init() {
    var nodes = document.querySelectorAll("[data-mapip-embed]");
    for (var i = 0; i < nodes.length; i += 1) {
      mount(nodes[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
