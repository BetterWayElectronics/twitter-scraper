// ==UserScript==
// @name         Twitter Replies Extractor with Auto-Scroll (Unique IDs, Configurable Settings, With Date & Media)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Auto-scrolls the Twitter "with_replies" page, collects unique replies made by the page owner, and exports them as a text file. Optionally includes the date of each post (formatted as DATE - POST), plus any URLs (including YouTube links) and images found in the tweet. Optionally saves any t.co links to a separate file. Includes a stop button. All key settings are grouped together for easy adjustments.
// @author       BwE
// @match        https://twitter.com/*/with_replies
// @match        https://x.com/*/with_replies
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------------
    // Configurable Settings
    // -------------------------------
    const scrollFactor = 1;          // Fraction of viewport height to scroll each time (1 for full page, 0.5 for half page, etc.)
    const checkInterval = 100;       // Interval (in ms) between each scroll & check
    const stableThreshold = 5000;    // How long (in ms) to wait without new unique tweets before stopping
    const includeDate = true;        // If true, add the date of each post in the output (format: DATE - POST)
    const exportTcoLinks = true;     // Toggle this to true to export t.co links to a separate file, false to disable.
    // -------------------------------

    // Only add the buttons if the current URL contains '/with_replies'
    if (!window.location.pathname.includes('/with_replies')) {
        return;
    }

    // Global variables to hold state for auto-scrolling
    let autoScrollIntervalId = null;
    // Use a Map to store tweets by unique tweet ID to avoid duplicates.
    let collectedTweetMap = new Map();
    let currentUsername = null;
    let prevCount = 0;
    let stableTime = 0;

    // Create and style an export button
    const exportBtn = document.createElement("button");
    exportBtn.innerText = "Export Replies";
    Object.assign(exportBtn.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        padding: "10px 15px",
        backgroundColor: "#1DA1F2",
        color: "#fff",
        border: "none",
        borderRadius: "5px",
        cursor: "pointer",
        zIndex: 9999,
        marginRight: "5px"
    });
    exportBtn.addEventListener("click", autoScrollAndExtract);
    document.body.appendChild(exportBtn);

    // Create and style a stop button
    const stopBtn = document.createElement("button");
    stopBtn.innerText = "Stop Scraping";
    Object.assign(stopBtn.style, {
        position: "fixed",
        top: "10px",
        right: "130px", // Positioned to the left of the export button
        padding: "10px 15px",
        backgroundColor: "#e0245e",
        color: "#fff",
        border: "none",
        borderRadius: "5px",
        cursor: "pointer",
        zIndex: 9999
    });
    stopBtn.addEventListener("click", stopScraping);
    document.body.appendChild(stopBtn);

    // Auto-scroll and then extract replies.
    // It will continue until no new unique tweets load for the stableThreshold period or the Stop button is clicked.
    function autoScrollAndExtract() {
        // Extract username from URL.
        // Example URL: https://x.com/elonmusk/with_replies
        const pathParts = window.location.pathname.split('/');
        if (pathParts.length < 2 || !pathParts[1]) {
            alert("Could not determine username from the URL.");
            return;
        }
        currentUsername = pathParts[1];

        // Reset global variables for a new run.
        collectedTweetMap = new Map();
        prevCount = 0;
        stableTime = 0;

        // Clear any previous interval if it exists.
        if (autoScrollIntervalId !== null) {
            clearInterval(autoScrollIntervalId);
        }

        autoScrollIntervalId = setInterval(() => {
            // Scroll by a configurable amount:
            window.scrollBy({ top: window.innerHeight * scrollFactor, behavior: "smooth" });

            // Look for tweet articles on the page.
            const tweets = document.querySelectorAll("article");
            tweets.forEach(tweet => {
                // Confirm the tweet is by the page owner.
                if (tweet.querySelector(`a[href="/${currentUsername}"]`)) {
                    // Try to extract a unique tweet identifier from the tweet's status URL.
                    const statusLink = tweet.querySelector('a[href*="/status/"]');
                    let tweetId;
                    if (statusLink) {
                        tweetId = statusLink.getAttribute("href");
                    } else {
                        // Fallback: use the tweet's text content if no status URL is found.
                        tweetId = tweet.innerText;
                    }
                    // Add the tweet only if it hasn't been collected already.
                    if (!collectedTweetMap.has(tweetId)) {
                        collectedTweetMap.set(tweetId, tweet.outerHTML);
                    }
                }
            });

            const currentCount = collectedTweetMap.size;
            // If no new unique tweets have been added during this interval, increase stableTime.
            if (currentCount === prevCount) {
                stableTime += checkInterval;
            } else {
                stableTime = 0;
                prevCount = currentCount;
            }

            console.log(`Collected ${currentCount} unique tweets so far. Stable time: ${stableTime} ms`);

            // If no new tweets are loaded for the stableThreshold period, assume we've loaded all available tweets.
            if (stableTime >= stableThreshold) {
                clearInterval(autoScrollIntervalId);
                autoScrollIntervalId = null;
                extractReplies(Array.from(collectedTweetMap.values()), currentUsername);
            }
        }, checkInterval);
    }

    // Stop button handler to end scraping early and export what has been collected so far.
    function stopScraping() {
        if (autoScrollIntervalId !== null) {
            clearInterval(autoScrollIntervalId);
            autoScrollIntervalId = null;
            console.log("Scraping stopped early. Exporting collected tweets...");
            if (currentUsername === null) {
                alert("No scraping process is currently running.");
                return;
            }
            extractReplies(Array.from(collectedTweetMap.values()), currentUsername);
        } else {
            alert("No scraping process is currently running.");
        }
    }

    // Extract replies from the collected tweet HTML and trigger a file download.
    // Also collects only the t.co links and, if enabled, exports them to a separate file.
    function extractReplies(tweetHTMLArray, username) {
        // Create a temporary container to re-create tweet nodes from their HTML.
        const container = document.createElement('div');
        const replies = [];
        // Use a Set to store unique t.co links.
        const tcoLinksSet = new Set();

        tweetHTMLArray.forEach(html => {
            container.innerHTML = html;
            const tweet = container.firstElementChild;
            // Verify the tweet is by the user.
            if (tweet.querySelector(`a[href="/${username}"]`)) {
                const tweetTextElement = tweet.querySelector('[data-testid="tweetText"]');
                if (tweetTextElement) {
                    let text = tweetTextElement.innerText.trim();

                    // If including the date, attempt to extract it.
                    if (includeDate) {
                        const timeElement = tweet.querySelector('time');
                        let dateStr = "";
                        if (timeElement) {
                            // Prefer the datetime attribute if available.
                            dateStr = timeElement.getAttribute("datetime") || timeElement.innerText;
                        }
                        if (dateStr) {
                            text = dateStr + " - " + text;
                        }
                    }

                    // -------------------------------
                    // Extract URLs and Image URLs
                    // -------------------------------
                    // Extract all links from the tweet text.
                    const tweetLinks = [];
                    tweetTextElement.querySelectorAll('a').forEach(link => {
                        const href = link.href;
                        if (href && href.startsWith("http")) {
                            tweetLinks.push(href);
                            // If it's a t.co link, add it to the set.
                            if (href.includes("t.co")) {
                                tcoLinksSet.add(href);
                            }
                        }
                    });

                    // Look for images within the tweet (using Twitter's typical test id for tweet images)
                    const tweetImages = [];
                    tweet.querySelectorAll('[data-testid="tweetPhoto"]').forEach(img => {
                        if (img.src) {
                            tweetImages.push(img.src);
                        }
                    });

                    // Append found links and image URLs to the tweet text.
                    if (tweetLinks.length > 0) {
                        text += "\nLinks: " + tweetLinks.join(", ");
                    }
                    if (tweetImages.length > 0) {
                        text += "\nImages: " + tweetImages.join(", ");
                    }
                    // -------------------------------

                    replies.push(text);
                }
            }
        });

        if (replies.length === 0) {
            alert("No replies found. They might not have loaded correctly.");
            return;
        }

        // Create a Blob with the replies and trigger a download.
        const blob = new Blob([replies.join("\n\n")], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${username}_replies.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`Exported ${replies.length} replies.`);

        // If the toggle is enabled and any t.co links were found, export them to a separate file.
        if (exportTcoLinks && tcoLinksSet.size > 0) {
            const tcoBlob = new Blob([Array.from(tcoLinksSet).join("\n")], { type: "text/plain;charset=utf-8" });
            const tcoUrl = URL.createObjectURL(tcoBlob);
            const aTco = document.createElement("a");
            aTco.href = tcoUrl;
            aTco.download = `${username}_tco_links.txt`;
            document.body.appendChild(aTco);
            aTco.click();
            document.body.removeChild(aTco);
            URL.revokeObjectURL(tcoUrl);
        }
    }
})();
