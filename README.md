# Silq Prototypes

Interactive HTML prototypes for Silq product features. Hosted via GitHub Pages.

**Live site:**
`https://am-as-pm.github.io/silq-prototypes/`

---

## How it works

- Most prototypes are **self-contained HTML files** — no build step, no dependencies
- Some (e.g. React builds) live in a folder with a built `index.html` + assets
- `index.html` is the landing page that links to all prototypes
- Pushing to `main` auto-deploys to GitHub Pages within ~60 seconds

## Current prototypes

| File | Feature | Owner |
|---|---|---|
| `pod-priority-board.html` | Pod Priority Board (Kanban + Pod Health) | — |
| `credit-limit-table.html` | Client Credit Limit Table (QuickBooks integration) | — |
| `tag-management-system/` | Tag Management System (typed tags + settings) | AM |
| `comments-audit-log/` | Comment Versioning & Audit Trail (roles + tracked changes) | AM |
| `product-metadata-ops-review.html` | Product Information — Ops Review (catalog layers, sources, gaps, feedback) | AM |

## Adding a new prototype

### 1. Create your HTML file

Build your prototype as a single `.html` file. Keep it self-contained — inline your CSS and JS, use CDN links for fonts/libraries. No external file dependencies.

Name it clearly: `your-feature-name.html` (lowercase, hyphens, no spaces).

### 2. Add it to the repo

Drop your HTML file in the root of this repo (same level as `index.html`).

### 3. Add a card to the landing page

Open `index.html` and add a new card inside the `<div class="cards">` section. Copy an existing card block and update:

```html
<a class="proto-card card-new" href="your-feature-name.html">
  <span class="card-arrow"><svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M1 8a.5.5 0 01.5-.5h11.793l-3.147-3.146a.5.5 0 01.708-.708l4 4a.5.5 0 010 .708l-4 4a.5.5 0 01-.708-.708L13.293 8.5H1.5A.5.5 0 011 8z"/></svg></span>
  <div class="card-icon">
    <!-- Pick an icon from https://heroicons.com (20x20 solid) -->
    <svg viewBox="0 0 20 20" fill="currentColor"><path d="..."/></svg>
  </div>
  <h2>Your Feature Name</h2>
  <p>Short description of what this prototype demonstrates.</p>
  <div class="card-tags">
    <span class="tag">Tag 1</span>
    <span class="tag">Tag 2</span>
  </div>
</a>
```

For the card color, add a CSS rule at the bottom of the `<style>` block:

```css
.card-new .card-icon { background: #e0f2fe; color: #0369a1; }
.card-new::before { background: #0369a1; }
```

### 4. Commit and push

Commit both files (`your-feature-name.html` and the updated `index.html`) and push to `main`. The live site updates automatically.

### 5. Update this README

Add a row to the table above with your prototype's filename, feature name, and your name.

## Design guidelines

- Use the **Silq design system** — `Inter` font, warm neutral palette (`#faf9f7` bg, `#c8842e` primary, `#2d2a26` text)
- CSS variables are defined in `:root` — reuse them for consistency
- Prototypes should be **view and filter only** — no write operations
- Use realistic dummy data that reflects actual Silq workflows
- Keep files under 200KB if possible for fast loading

## Repo structure

```
silq-prototypes/
├── index.html                   Landing page (links to all prototypes)
├── pod-priority-board.html      Pod Priority Board prototype
├── credit-limit-table.html      Credit Limit Table prototype
├── comments-audit-log/          Comment Versioning & Audit Trail (built Next.js app)
├── tag-management-system/       Tag Management System (built React app)
├── your-new-prototype.html      (add new prototypes here)
└── README.md                    This file
```
