# Kepler Simulation

An interactive Three.js day/night tracker for an Earth-like terrestrial planet orbiting the Kepler-16 binary stars. The browser model visualizes the binary pair, the planet's elliptical circumbinary orbit, its rotation, a single moon, equatorial solar altitude, and lunar illumination.

## Run locally

The app uses native JavaScript modules and a pinned Three.js CDN import map. Serve the project root over HTTP (opening `index.html` as a `file://` URL will block module imports):

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Drag the scene to orbit the camera and scroll to zoom. Use the year, orbit day, time-of-day, and speed controls to scrub or play the simulation. The camera controls at the lower-right reset or pause the slow camera orbit.

## GitHub Pages

The `Deploy to GitHub Pages` workflow publishes the project root when changes are pushed to `main`. Enable GitHub Pages with **GitHub Actions** as the build and deployment source in repository settings. The first successful workflow deployment makes the page available at the repository's GitHub Pages URL.

## Model

- The central system follows Kepler-16 reference masses, radii, binary period, and orbital elements. The solid planet uses the reference 228.776-day circumbinary orbit; it does not represent gas giant Kepler-16b itself.
- The planet has an Earth radius, an Earthlike 23.9344696-hour sidereal rotation, and a 23.44-degree axial tilt. The equatorial daylight panel reports geometric sun altitudes.
- One Moon-radius satellite orbits at a mean center-to-center distance of 499,720 km. Its 40.5-day period is provisional because the terrestrial planet's mass has not been set.
- Epoch zero uses the large sun → small sun → planet → moon alignment. Planet spin and the stellar and lunar orbits continue across year boundaries; selecting year 1 does not reset the sky.
- Orbital positions use independent two-body Keplerian ellipses in one plane. The visualization is not a climate model or full N-body simulation. Body sizes and the moon's local orbit are enlarged so they remain visible at system scale.

The accompanying C tracker can calculate more detailed instantaneous geometry and CSV tracks; see [`docs/tracker.md`](docs/tracker.md).
