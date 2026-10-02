# C day/night tracker

The command-line tracker complements the browser visualization. It reports both suns' local altitudes and apparent motion, along with the geometric lunar phase and eclipse flags.

## Build

From the repository root:

```sh
mkdir -p build
cc -std=c11 -O2 -Wall -Wextra -Wpedantic \
  src/kepler16_daynight_tracker.c -lm \
  -o build/kepler16-daynight-tracker
```

## Examples

Evaluate the equator at planetary orbit day 45, local time 06:30:

```sh
build/kepler16-daynight-tracker --day 45 --hour 6.5
```

Track one local day in six-minute increments:

```sh
build/kepler16-daynight-tracker --day 45 --track-day-step 0.1 \
  --latitude 0 --longitude 0
```

Track one full 228.776-day orbit in one-day steps:

```sh
build/kepler16-daynight-tracker --track-step 1 --hour 6.5 \
  --latitude 35 --longitude 120
```

Override the provisional lunar period:

```sh
build/kepler16-daynight-tracker --track-step 1 \
  --moon-period-days 40.5
```

Output is CSV. Fields include solar altitude and separation, apparent solar-day length, daylight state, stellar eclipse geometry, lunar orbital longitude and angular diameter, illumination by each sun, and whether the planet casts an eclipse as viewed from the moon.

## Assumptions and limits

- The solid target planet has Earth's radius. Its mass is unset; the moon's default 40.5-day period is a provisional estimate based on Earth and Moon masses.
- The moon is Moon-radius and orbits at 499,720 km mean distance.
- The default epoch aligns large sun → small sun → planet → moon, with the equatorial local clock at midnight. The C tracker's default spin phase matches the browser view; continuous elapsed days preserve rotation and binary phase across planetary years.
- The moon starts on the outward radial line at epoch zero and then advances in the inertial orbital plane. Its position does not inherit the planet's changing longitude.
- Orbits are independent Keplerian ellipses in one plane. This is a day/night approximation, not N-body dynamics, climate, tides, or a habitability model.
- Lunar illumination uses equal weight for both stars because stellar luminosities for this fictional target are not specified. The C tracker reports geometric illumination and eclipse flags separately; the browser estimate reduces visible illumination by modeled planetary shadowing and shows its equivalent single-source geometry.

Run `build/kepler16-daynight-tracker --help` for supported arguments.
