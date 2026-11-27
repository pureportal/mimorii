# Website traffic

Mimorii measures visits to websites that are already resources. Open **Insights → Traffic**, choose **Track website**, and add the snippet from the **Setup** tab to every page:

```html
<script
  defer
  src="https://mimorii.example.com/api/traffic/script.js"
  data-site="<site key>"
></script>
```

Events are accepted only from the domains listed for the site. New sites start with the hostnames of the resource's HTTP checks.

## What the site report shows

- Visitors, visits, pageviews, bounce rate, and time on page compared with the previous period
- Pages, entry pages, referrers, UTM campaigns, countries, languages, devices, browsers, and operating systems
- Visitors on the site during the last five minutes
- Core Web Vitals (LCP, INP, CLS, FCP, TTFB) at the 75th percentile per page
- JavaScript errors with the affected page and visitor count
- Custom events and outbound link clicks
- Click heatmaps, rage clicks, and scroll depth per page and device

## Custom events

Name an element to count clicks on it:

```html
<button data-mimorii-event="Signup">Sign up</button>
```

Or send an event from code:

```js
window.mimorii?.track("Checkout completed");
```

## Heatmaps

Heatmaps record which element was clicked and where inside it, so the overlay stays correct when the layout changes between screen sizes. **Open heatmap** shows the overlay on the live page through a link that expires after one hour.

Clicks inside elements marked with `data-mimorii-mask` are not recorded. Text typed into fields is never recorded, and the label of a click is taken only from links and buttons. Turning heatmaps off for a site deletes its recorded clicks.

## Privacy

- No cookies, local storage, or other browser storage, and no fingerprinting beyond the request itself
- Visitors are counted with a hash of the site, IP address, and user agent salted with a random value that changes every day; the salt is deleted after the day ends, so visitors cannot be recognized across days and the IP address is never stored
- The country is derived from the browser time zone, not from the IP address
- Browsers that send Do Not Track or Global Privacy Control are not measured, and known bots are ignored
- Query strings and fragments are removed from page addresses; only `utm_source` (or `ref`) and `utm_campaign` are kept
- Path segments that look like IDs or tokens (UUIDs, long numbers, hashes, random strings) are stored as `:id`
- Email addresses and long numbers in event names, error messages, and click labels are masked before storage
- Raw events are deleted after `MIMORII_TRAFFIC_RETENTION_DAYS` (default 395) and heatmap clicks after `MIMORII_HEATMAP_RETENTION_DAYS` (default 90)

Mention the measurement in the website's privacy policy.

## Consent

The script still reads the page address, window width, time zone, and language in the browser. Where your rules require consent for that, such as § 25 TDDDG in Germany, turn on **Wait for consent** in the **Setup** tab (it adds `data-consent` to the snippet) and start measuring from your consent banner:

```html
<script
  defer
  src="https://mimorii.example.com/api/traffic/script.js"
  data-site="<site key>"
  data-consent
></script>
```

```js
window.mimorii.consent(true);
window.mimorii.consent(false);
```

Nothing is measured or sent before `consent(true)`. `consent(false)` stops measuring for the rest of the page visit.

## Mimorii's own analytics

A Mimorii deployment can measure its own web app with the same feature. Track the deployment as a website, then build the client with `VITE_MIMORII_TRAFFIC_SITE=<site key>`. The app shows a consent banner and loads the script in consent mode only after the user accepts.
