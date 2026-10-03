"use client";

/** Asks once, from a click, so the browser can tell the user when a long run finishes. */
export function requestNotificationPermission(): void {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

/** Shows a system notification, but only when the app is not the tab in view. */
export function notify(title: string, body: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const notification = new Notification(title, { body, icon: "/icon-192.png", tag: "video-summaries" });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
