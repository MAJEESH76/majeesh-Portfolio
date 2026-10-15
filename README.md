# Majeesh S, Aerospace Engineer: Portfolio

Personal portfolio of **Majeesh S**, an Aerospace Engineering graduate (B.Tech, Karunya Institute of Technology and Sciences, 2022–2026) working in CFD, thermal and structural analysis.

**Live site:** https://majeesh76.github.io/majeesh-Portfolio/

## What's on the site

| Page | Contents |
| --- | --- |
| Home | Profile, engineering projects, CATIA design portfolio, skills, internships, FAQ, contact and resume download |
| Files (`/files/`) | Browser for my CAD and rocket design files, with a 2D and 3D view of each file |

The **Files** page lists every CATIA part and assembly, AutoCAD drawing and OpenRocket design:

- **OpenRocket (.ork):** the rocket geometry is read from the file and drawn as a dimensioned 2D side profile and an interactive 3D model (drag to rotate, scroll to zoom).
- **CATIA (.CATPart / .CATProduct):** rendered 3D view of the part.
- **AutoCAD (.dwg):** 2D drawing preview.

## Tech stack

- [Astro 7](https://astro.build) static site, Tailwind CSS 4
- [three.js](https://threejs.org) for the 3D rocket viewer (loaded only when a 3D view is opened)
- Deployed to GitHub Pages with GitHub Actions

## Run locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open http://localhost:4321.

## Editing content

| What | Where |
| --- | --- |
| Page text (hero, projects, skills, about, FAQ, footer, menu) | `src/data/i18n/nova.json` |
| Section order on the homepage | `src/data/pages/index.json` |
| Profile photo | `public/assets/images/profile/` |
| Design portfolio images | `public/assets/images/designs/` |
| Resume PDF | `public/assets/resume/Majeeshresumeaerospace.pdf` |
| Site name, email, phone | `src/data/global/company.json` |
| Site URL | `site.config.mjs` |

### Updating the Files page

The CAD source files live in `design-files/` (sorted into `catia/`, `autocad/`, `openrocket/` and `presentations/`). This folder is **git-ignored**, so the original CAD files are never published. Only the generated previews and `src/data/design-files/manifest.json` are committed.

After adding or changing files in `design-files/`, regenerate the page data:

```bash
npm run design-files:sync
```

To make a CATIA part rotatable in 3D, export it from CATIA as STL, save it as `design-files/models/<same file name>.stl` and run the sync again.

## Build and deploy

```bash
npm run build:github   # production build for https://majeesh76.github.io/majeesh-Portfolio/
```

The output is written to `dist/`. Every push to `main` builds and deploys the site automatically through `.github/workflows/deploy.yml`.

**First-time setup on GitHub:** open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**.

### Netlify

`netlify.toml` builds with `npm run build:netlify`, which serves the site from the domain root and marks it noindex (GitHub Pages stays the indexed site). Connect the Netlify site to this repository, or run `npm run build:netlify` and drag the `dist/` folder onto the Netlify deploys page. Do not upload a `build:github` output to Netlify: its links start with `/majeesh-Portfolio/`.

If the repository is renamed or a custom domain is used, update `SITE_URL` in `site.config.mjs` and `PUBLIC_BASE_PATH` / `PUBLIC_SITE_URL` in `scripts/build-github.mjs`.

## Contact

- Email: majeeshmajeesh611@gmail.com
- LinkedIn: [linkedin.com/in/majeeshs](https://linkedin.com/in/majeeshs)

## Credits

Built on the [Nova Astro template](https://themewagon.com/themes/nova-astro/). Template design and code © [WebScale](https://webscale.pl/), distributed by [ThemeWagon](https://themewagon.com), used under the Nova Free Release License (see `LICENSE.md`).

Portfolio content, photos, CAD renders and the resume © Majeesh S. All rights reserved.
