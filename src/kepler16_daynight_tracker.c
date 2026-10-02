#include <errno.h>
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PI 3.14159265358979323846
#define TWO_PI (2.0 * PI)
#define AU_PER_SOLAR_RADIUS 0.00465046726096
#define KM_PER_AU 149597870.7
#define EARTH_RADIUS_KM 6371.0
#define MOON_RADIUS_KM 1737.4
#define MOON_DISTANCE_KM (1.3 * 384400.0)

typedef struct {
    double x;
    double y;
    double z;
} Vec3;

typedef struct {
    double mass_solar;
    double radius_solar;
} Star;

typedef struct {
    double period_days;
    double semi_major_axis_au;
    double eccentricity;
    double argument_periapsis_deg;
    double periapsis_day;
} Orbit;

typedef struct {
    double day;
    double hour;
    double rotation_hours;
    double longitude_deg;
    double latitude_deg;
    double obliquity_deg;
    double pole_angle_deg;
    double rotation_phase_deg;
    double planet_periapsis_day;
    double binary_periapsis_day;
    double moon_period_days;
    double track_step_days;
    double track_day_step_hours;
    bool track_year;
    bool track_day;
    bool day_was_set;
    bool hour_was_set;
} Options;

typedef struct {
    double x;
    double y;
} Vec2;

typedef struct {
    Vec2 position;
    Vec2 velocity;
} OrbitalState;

typedef struct {
    double distance_au;
    Vec3 direction;
    double altitude_deg;
    double angular_radius_rad;
    double apparent_angular_velocity_rad_per_day;
    double solar_day_hours;
} ApparentStar;

static const Star STAR_A = {0.6897, 0.6489};
static const Star STAR_B = {0.20255, 0.2260};

static const Orbit BINARY_ORBIT = {
    41.0792, 0.22431, 0.15944, 263.29, 0.0
};

static const Orbit PLANET_ORBIT = {
    228.776, 0.7048, 0.0069, 318.0, 34.3586873
};

/* Approximate circular period for this distance if the planet has Earth's mass. */
static const double MOON_PERIOD_DAYS = 40.5;

static double degrees_to_radians(double degrees)
{
    return degrees * PI / 180.0;
}

static double radians_to_degrees(double radians)
{
    return radians * 180.0 / PI;
}

static double clamp(double value, double lower, double upper)
{
    if (value < lower) {
        return lower;
    }
    if (value > upper) {
        return upper;
    }
    return value;
}

static double normalize_radians(double angle)
{
    angle = fmod(angle, TWO_PI);
    if (angle < 0.0) {
        angle += TWO_PI;
    }
    return angle;
}

static double dot(Vec3 a, Vec3 b)
{
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

static Vec3 scale(Vec3 vector, double factor)
{
    return (Vec3){vector.x * factor, vector.y * factor, vector.z * factor};
}

static double length(Vec3 vector)
{
    return sqrt(dot(vector, vector));
}

static Vec3 unit(Vec3 vector)
{
    double magnitude = length(vector);
    if (magnitude == 0.0) {
        return (Vec3){0.0, 0.0, 0.0};
    }
    return scale(vector, 1.0 / magnitude);
}

static double solve_kepler(double mean_anomaly, double eccentricity)
{
    double eccentric_anomaly = mean_anomaly;
    int iteration;

    for (iteration = 0; iteration < 50; iteration++) {
        double residual = eccentric_anomaly
            - eccentricity * sin(eccentric_anomaly) - mean_anomaly;
        double derivative = 1.0 - eccentricity * cos(eccentric_anomaly);
        double correction = residual / derivative;
        eccentric_anomaly -= correction;
        if (fabs(correction) < 1e-13) {
            break;
        }
    }

    return eccentric_anomaly;
}

static OrbitalState orbital_state(const Orbit *orbit, double time_day)
{
    double mean_anomaly = normalize_radians(
        TWO_PI * (time_day - orbit->periapsis_day) / orbit->period_days);
    double eccentric_anomaly = solve_kepler(mean_anomaly, orbit->eccentricity);
    double true_anomaly = 2.0 * atan2(
        sqrt(1.0 + orbit->eccentricity) * sin(eccentric_anomaly / 2.0),
        sqrt(1.0 - orbit->eccentricity) * cos(eccentric_anomaly / 2.0));
    double radius = orbit->semi_major_axis_au
        * (1.0 - orbit->eccentricity * cos(eccentric_anomaly));
    double theta = true_anomaly
        + degrees_to_radians(orbit->argument_periapsis_deg);
    double mean_motion = TWO_PI / orbit->period_days;
    double eccentric_denominator = 1.0
        - orbit->eccentricity * cos(eccentric_anomaly);
    double radial_velocity = orbit->semi_major_axis_au * orbit->eccentricity
        * mean_motion * sin(eccentric_anomaly) / eccentric_denominator;
    double angular_velocity = mean_motion * sqrt(1.0
        - orbit->eccentricity * orbit->eccentricity)
        / (eccentric_denominator * eccentric_denominator);
    double tangential_velocity = radius * angular_velocity;
    Vec2 position = {radius * cos(theta), radius * sin(theta)};
    Vec2 velocity = {
        radial_velocity * cos(theta) - tangential_velocity * sin(theta),
        radial_velocity * sin(theta) + tangential_velocity * cos(theta)
    };

    return (OrbitalState){position, velocity};
}

static Vec3 local_surface_normal(const Options *options, double time_day)
{
    double obliquity = degrees_to_radians(options->obliquity_deg);
    double pole_angle = degrees_to_radians(options->pole_angle_deg);
    double latitude = degrees_to_radians(options->latitude_deg);
    double longitude = degrees_to_radians(options->longitude_deg);
    double spin_period_days = options->rotation_hours / 24.0;
    double rotation = degrees_to_radians(options->rotation_phase_deg)
        + TWO_PI * time_day / spin_period_days;

    double x = cos(latitude) * cos(longitude + rotation);
    double y = cos(latitude) * sin(longitude + rotation) * cos(obliquity)
        - sin(latitude) * sin(obliquity);
    double z = cos(latitude) * sin(longitude + rotation) * sin(obliquity)
        + sin(latitude) * cos(obliquity);

    /* Rotate the seasonal reference around the orbital normal. */
    return (Vec3){
        x * cos(pole_angle) - y * sin(pole_angle),
        x * sin(pole_angle) + y * cos(pole_angle),
        z
    };
}

static ApparentStar apparent_star(
    Star star,
    Vec2 star_position,
    Vec2 star_velocity,
    Vec2 planet_position,
    Vec2 planet_velocity,
    Vec3 surface_normal,
    double rotation_angular_velocity)
{
    Vec3 sightline = {
        star_position.x - planet_position.x,
        star_position.y - planet_position.y,
        0.0
    };
    Vec2 relative_velocity = {
        star_velocity.x - planet_velocity.x,
        star_velocity.y - planet_velocity.y
    };
    double distance = length(sightline);
    Vec3 direction = unit(sightline);
    double elevation = asin(clamp(dot(surface_normal, direction), -1.0, 1.0));
    double star_radius_au = star.radius_solar * AU_PER_SOLAR_RADIUS;
    double angular_radius = asin(clamp(star_radius_au / distance, 0.0, 1.0));
    double apparent_angular_velocity =
        (sightline.x * relative_velocity.y - sightline.y * relative_velocity.x)
        / (distance * distance);
    double relative_angular_velocity = fabs(
        rotation_angular_velocity - apparent_angular_velocity);
    double solar_day_hours = relative_angular_velocity > 1e-14
        ? 24.0 * TWO_PI / relative_angular_velocity
        : HUGE_VAL;

    return (ApparentStar){
        distance,
        direction,
        radians_to_degrees(elevation),
        angular_radius,
        apparent_angular_velocity,
        solar_day_hours
    };
}

static void positions_at_time(
    double time_day,
    const Options *options,
    Vec2 *planet_position,
    Vec2 *planet_velocity,
    Vec2 *star_a_position,
    Vec2 *star_a_velocity,
    Vec2 *star_b_position,
    Vec2 *star_b_velocity)
{
    Orbit planet_orbit = PLANET_ORBIT;
    Orbit binary_orbit = BINARY_ORBIT;
    double total_mass = STAR_A.mass_solar + STAR_B.mass_solar;
    double mass_fraction_a;
    double mass_fraction_b;
    OrbitalState planet_state;
    OrbitalState binary_state;

    planet_orbit.periapsis_day = options->planet_periapsis_day;
    binary_orbit.periapsis_day = options->binary_periapsis_day;
    planet_state = orbital_state(&planet_orbit, time_day);
    binary_state = orbital_state(&binary_orbit, time_day);
    *planet_position = planet_state.position;
    *planet_velocity = planet_state.velocity;

    mass_fraction_a = STAR_A.mass_solar / total_mass;
    mass_fraction_b = STAR_B.mass_solar / total_mass;

    *star_a_position = (Vec2){
        -mass_fraction_b * binary_state.position.x,
        -mass_fraction_b * binary_state.position.y
    };
    *star_a_velocity = (Vec2){
        -mass_fraction_b * binary_state.velocity.x,
        -mass_fraction_b * binary_state.velocity.y
    };
    *star_b_position = (Vec2){
        mass_fraction_a * binary_state.position.x,
        mass_fraction_a * binary_state.position.y
    };
    *star_b_velocity = (Vec2){
        mass_fraction_a * binary_state.velocity.x,
        mass_fraction_a * binary_state.velocity.y
    };
}

static const char *lighting_state(double altitude_a, double altitude_b)
{
    bool a_up = altitude_a > 0.0;
    bool b_up = altitude_b > 0.0;

    if (a_up && b_up) {
        return "both_suns_up";
    }
    if (a_up) {
        return "star_a_only";
    }
    if (b_up) {
        return "star_b_only";
    }
    return "night";
}

static const char *eclipse_state(
    const ApparentStar *star_a,
    const ApparentStar *star_b,
    bool star_a_up,
    bool star_b_up)
{
    double separation = acos(clamp(
        dot(star_a->direction, star_b->direction), -1.0, 1.0));

    if (!star_a_up || !star_b_up) {
        return "none";
    }
    if (separation >= star_a->angular_radius_rad + star_b->angular_radius_rad) {
        return "none";
    }
    if (star_a->distance_au < star_b->distance_au) {
        return "star_a_foreground";
    }
    return "star_b_foreground";
}

static double barycenter_synodic_day_hours(Vec2 planet_position, Vec2 planet_velocity,
    double rotation_angular_velocity)
{
    double radius_squared = planet_position.x * planet_position.x
        + planet_position.y * planet_position.y;
    double apparent_angular_velocity =
        (planet_position.x * planet_velocity.y
            - planet_position.y * planet_velocity.x) / radius_squared;
    double relative_angular_velocity = fabs(
        rotation_angular_velocity - apparent_angular_velocity);

    return relative_angular_velocity > 1e-14
        ? 24.0 * TWO_PI / relative_angular_velocity
        : HUGE_VAL;
}

static double lunar_illumination_fraction(Vec3 moon_to_observer,
    Vec3 moon_to_star)
{
    /* Full when the moon-to-observer and moon-to-star directions coincide. */
    return clamp(0.5 * (1.0 + dot(moon_to_observer, moon_to_star)),
        0.0, 1.0);
}

static const char *lunar_eclipse_state(
    Vec3 moon_position,
    Vec2 planet_position,
    Vec2 star_position,
    double star_radius_solar)
{
    Vec3 to_planet = {
        planet_position.x - moon_position.x,
        planet_position.y - moon_position.y,
        -moon_position.z
    };
    Vec3 to_star = {
        star_position.x - moon_position.x,
        star_position.y - moon_position.y,
        -moon_position.z
    };
    double planet_distance_au = length(to_planet);
    double star_distance_au = length(to_star);
    double planet_angular_radius;
    double star_angular_radius;
    double separation;

    if (planet_distance_au >= star_distance_au) {
        return "none";
    }
    planet_angular_radius = asin(clamp(
        (EARTH_RADIUS_KM / KM_PER_AU) / planet_distance_au, 0.0, 1.0));
    star_angular_radius = asin(clamp(
        (star_radius_solar * AU_PER_SOLAR_RADIUS) / star_distance_au,
        0.0, 1.0));
    separation = acos(clamp(dot(unit(to_planet), unit(to_star)), -1.0, 1.0));

    if (separation >= planet_angular_radius + star_angular_radius) {
        return "none";
    }
    if (separation + star_angular_radius <= planet_angular_radius) {
        return "total";
    }
    return "partial";
}

static void print_row(double day, double hour, const Options *options)
{
    double time_day = day + hour / 24.0;
    Vec2 planet_position;
    Vec2 planet_velocity;
    Vec2 star_a_position;
    Vec2 star_a_velocity;
    Vec2 star_b_position;
    Vec2 star_b_velocity;
    Vec3 surface_normal = local_surface_normal(options, time_day);
    ApparentStar star_a;
    ApparentStar star_b;
    double rotation_angular_velocity = TWO_PI / (options->rotation_hours / 24.0);
    double barycenter_day_hours;
    double separation_deg;
    double year_phase = fmod(time_day, PLANET_ORBIT.period_days);
    double planet_longitude;
    double moon_longitude;
    double moon_distance_au = MOON_DISTANCE_KM / KM_PER_AU;
    double moon_angular_diameter_deg;
    Vec3 moon_position;
    Vec3 moon_to_observer;
    Vec3 moon_to_star_a;
    Vec3 moon_to_star_b;
    double moon_star_a_illumination;
    double moon_star_b_illumination;
    bool star_a_up;
    bool star_b_up;

    if (year_phase < 0.0) {
        year_phase += PLANET_ORBIT.period_days;
    }

    positions_at_time(time_day, options,
        &planet_position, &planet_velocity,
        &star_a_position, &star_a_velocity,
        &star_b_position, &star_b_velocity);
    star_a = apparent_star(STAR_A, star_a_position, star_a_velocity,
        planet_position, planet_velocity, surface_normal, rotation_angular_velocity);
    star_b = apparent_star(STAR_B, star_b_position, star_b_velocity,
        planet_position, planet_velocity, surface_normal, rotation_angular_velocity);
    barycenter_day_hours = barycenter_synodic_day_hours(
        planet_position, planet_velocity, rotation_angular_velocity);
    star_a_up = star_a.altitude_deg > 0.0;
    star_b_up = star_b.altitude_deg > 0.0;
    separation_deg = radians_to_degrees(acos(clamp(
        dot(star_a.direction, star_b.direction), -1.0, 1.0)));

    /* Moon follows a circular, coplanar orbit at the specified mean distance. */
    planet_longitude = atan2(planet_position.y, planet_position.x);
    moon_longitude = normalize_radians(
        planet_longitude + TWO_PI * time_day / options->moon_period_days);
    moon_position = (Vec3){
        planet_position.x + moon_distance_au * cos(moon_longitude),
        planet_position.y + moon_distance_au * sin(moon_longitude),
        0.0
    };
    moon_to_observer = unit((Vec3){
        planet_position.x - moon_position.x,
        planet_position.y - moon_position.y,
        0.0
    });
    moon_to_star_a = unit((Vec3){
        star_a_position.x - moon_position.x,
        star_a_position.y - moon_position.y,
        0.0
    });
    moon_to_star_b = unit((Vec3){
        star_b_position.x - moon_position.x,
        star_b_position.y - moon_position.y,
        0.0
    });
    moon_star_a_illumination = lunar_illumination_fraction(
        moon_to_observer, moon_to_star_a);
    moon_star_b_illumination = lunar_illumination_fraction(
        moon_to_observer, moon_to_star_b);
    moon_angular_diameter_deg = radians_to_degrees(2.0 * asin(clamp(
        (MOON_RADIUS_KM / KM_PER_AU) / moon_distance_au, 0.0, 1.0)));

    printf("%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,%s,%s,"
        "%.3f,%.2f,%.3f,%.2f,%.2f,%.2f,%s,%s\n",
        day,
        hour,
        time_day,
        year_phase,
        star_a.altitude_deg,
        star_b.altitude_deg,
        separation_deg,
        star_a.distance_au,
        star_b.distance_au,
        barycenter_day_hours,
        star_a.solar_day_hours,
        star_b.solar_day_hours,
        lighting_state(star_a.altitude_deg, star_b.altitude_deg),
        eclipse_state(&star_a, &star_b, star_a_up, star_b_up),
        radians_to_degrees(moon_longitude),
        MOON_DISTANCE_KM,
        moon_angular_diameter_deg,
        100.0 * moon_star_a_illumination,
        100.0 * moon_star_b_illumination,
        50.0 * (moon_star_a_illumination + moon_star_b_illumination),
        lunar_eclipse_state(moon_position, planet_position, star_a_position,
            STAR_A.radius_solar),
        lunar_eclipse_state(moon_position, planet_position, star_b_position,
            STAR_B.radius_solar));
}

static void print_header(void)
{
    puts("day_input,local_hour,elapsed_days,planet_year_day,"
         "star_a_altitude_deg,star_b_altitude_deg,star_separation_deg,"
         "star_a_distance_au,star_b_distance_au,barycenter_synodic_day_hours,"
         "star_a_solar_day_hours,star_b_solar_day_hours,lighting_state,stellar_eclipse,"
         "moon_orbit_longitude_deg,moon_distance_km,moon_angular_diameter_deg,"
         "moon_star_a_illumination_pct,moon_star_b_illumination_pct,"
         "moon_equal_weight_illumination_pct,moon_star_a_eclipse,moon_star_b_eclipse");
}

static void print_usage(FILE *stream, const char *program)
{
    fprintf(stream,
        "Usage: %s [options]\n"
        "\n"
        "Track geometric daylight and the phase of one moon in a\n"
        "Kepler-16-inspired, coplanar two-star system. Outputs CSV.\n"
        "\n"
        "Options:\n"
        "  --day DAYS                    Elapsed days from model epoch (default: 0)\n"
        "  --hour HOURS                  Local rotation-clock hour, 0 to 24 (default: 12)\n"
        "  --track-step DAYS             Track one year at the selected local hour\n"
        "  --track-day-step HOURS        Track one local day at the selected year day\n"
        "  --longitude DEG               Surface longitude (default: 0)\n"
        "  --latitude DEG                Surface latitude (default: 0)\n"
        "  --rotation-hours HOURS        Sidereal spin period (default: 23.93447)\n"
        "  --obliquity-deg DEG           Axial tilt (default: 23.44)\n"
        "  --pole-angle-deg DEG          Seasonal orientation in orbital plane (default: 0)\n"
        "  --rotation-phase-deg DEG      Spin phase at day 0 (default: 0)\n"
        "  --planet-periastron-day DAY   Planet periapsis epoch (default: 34.3586873)\n"
        "  --binary-periastron-day DAY   Binary orbit phase reference (default: 0)\n"
        "  --moon-period-days DAYS       Moon orbital period (default: 40.5)\n"
        "  --help                        Show this help\n",
        program);
}

static bool parse_double(const char *text, double *value)
{
    char *end = NULL;
    double parsed;

    errno = 0;
    parsed = strtod(text, &end);
    if (text == end || *end != '\0' || errno == ERANGE || !isfinite(parsed)) {
        return false;
    }
    *value = parsed;
    return true;
}

static bool read_option_value(
    int argc,
    char **argv,
    int *index,
    const char *option,
    double *destination)
{
    if (*index + 1 >= argc || !parse_double(argv[*index + 1], destination)) {
        fprintf(stderr, "Expected a finite number after %s.\n", option);
        return false;
    }
    *index += 1;
    return true;
}

static bool parse_options(int argc, char **argv, Options *options)
{
    int index;

    *options = (Options){
        .day = 0.0,
        .hour = 12.0,
        .rotation_hours = 23.9344696,
        .longitude_deg = 0.0,
        .latitude_deg = 0.0,
        .obliquity_deg = 23.44,
        .pole_angle_deg = 0.0,
        .rotation_phase_deg = 0.0,
        .planet_periapsis_day = 34.3586873,
        .binary_periapsis_day = 0.0,
        .moon_period_days = MOON_PERIOD_DAYS,
        .track_step_days = 0.0,
        .track_day_step_hours = 0.0,
        .track_year = false,
        .track_day = false,
        .day_was_set = false,
        .hour_was_set = false
    };

    for (index = 1; index < argc; index++) {
        const char *arg = argv[index];

        if (strcmp(arg, "--help") == 0) {
            print_usage(stdout, argv[0]);
            exit(EXIT_SUCCESS);
        } else if (strcmp(arg, "--day") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->day)) {
                return false;
            }
            options->day_was_set = true;
        } else if (strcmp(arg, "--hour") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->hour)) {
                return false;
            }
            options->hour_was_set = true;
        } else if (strcmp(arg, "--track-step") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->track_step_days)) {
                return false;
            }
            options->track_year = true;
        } else if (strcmp(arg, "--track-day-step") == 0) {
            if (!read_option_value(argc, argv, &index, arg,
                    &options->track_day_step_hours)) {
                return false;
            }
            options->track_day = true;
        } else if (strcmp(arg, "--longitude") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->longitude_deg)) {
                return false;
            }
        } else if (strcmp(arg, "--latitude") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->latitude_deg)) {
                return false;
            }
        } else if (strcmp(arg, "--rotation-hours") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->rotation_hours)) {
                return false;
            }
        } else if (strcmp(arg, "--obliquity-deg") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->obliquity_deg)) {
                return false;
            }
        } else if (strcmp(arg, "--pole-angle-deg") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->pole_angle_deg)) {
                return false;
            }
        } else if (strcmp(arg, "--rotation-phase-deg") == 0) {
            if (!read_option_value(argc, argv, &index, arg, &options->rotation_phase_deg)) {
                return false;
            }
        } else if (strcmp(arg, "--planet-periastron-day") == 0) {
            if (!read_option_value(argc, argv, &index, arg,
                    &options->planet_periapsis_day)) {
                return false;
            }
        } else if (strcmp(arg, "--binary-periastron-day") == 0) {
            if (!read_option_value(argc, argv, &index, arg,
                    &options->binary_periapsis_day)) {
                return false;
            }
        } else if (strcmp(arg, "--moon-period-days") == 0) {
            if (!read_option_value(argc, argv, &index, arg,
                    &options->moon_period_days)) {
                return false;
            }
        } else {
            fprintf(stderr, "Unknown option: %s\n", arg);
            return false;
        }
    }

    if (options->track_year && options->track_day) {
        fputs("Choose either --track-step or --track-day-step.\n", stderr);
        return false;
    }
    if (options->track_year && options->day_was_set) {
        fputs("--track-step already spans the full year; omit --day.\n", stderr);
        return false;
    }
    if (options->track_day && options->hour_was_set) {
        fputs("--track-day-step spans the full local day; omit --hour.\n", stderr);
        return false;
    }
    if (options->track_year
        && (options->track_step_days <= 0.0
            || options->track_step_days > PLANET_ORBIT.period_days)) {
        fputs("--track-step must be greater than 0 and no more than one planet year.\n",
            stderr);
        return false;
    }
    if (options->track_year
        && PLANET_ORBIT.period_days / options->track_step_days > 1000000.0) {
        fputs("--track-step would produce more than one million rows.\n", stderr);
        return false;
    }
    if (options->track_day
        && (options->track_day_step_hours <= 0.0
            || options->track_day_step_hours > 24.0)) {
        fputs("--track-day-step must be greater than 0 and no more than 24 hours.\n",
            stderr);
        return false;
    }
    if (options->track_day
        && 24.0 / options->track_day_step_hours > 1000000.0) {
        fputs("--track-day-step would produce more than one million rows.\n", stderr);
        return false;
    }
    if (options->hour < 0.0 || options->hour > 24.0) {
        fputs("--hour must be between 0 and 24.\n", stderr);
        return false;
    }
    if (options->rotation_hours <= 0.0) {
        fputs("--rotation-hours must be greater than 0.\n", stderr);
        return false;
    }
    if (options->moon_period_days <= 0.0) {
        fputs("Moon orbital period must be greater than 0 days.\n", stderr);
        return false;
    }
    if (options->latitude_deg < -90.0 || options->latitude_deg > 90.0) {
        fputs("--latitude must be between -90 and 90 degrees.\n", stderr);
        return false;
    }
    if (options->obliquity_deg < 0.0 || options->obliquity_deg > 180.0) {
        fputs("--obliquity-deg must be between 0 and 180 degrees.\n", stderr);
        return false;
    }
    return true;
}

int main(int argc, char **argv)
{
    Options options;

    if (!parse_options(argc, argv, &options)) {
        print_usage(stderr, argv[0]);
        return EXIT_FAILURE;
    }

    print_header();
    if (options.track_year) {
        double time_day;
        for (time_day = 0.0;
             time_day < PLANET_ORBIT.period_days;
             time_day += options.track_step_days) {
            print_row(time_day, options.hour, &options);
        }
        print_row(PLANET_ORBIT.period_days, options.hour, &options);
    } else if (options.track_day) {
        double hour;
        for (hour = 0.0; hour < 24.0; hour += options.track_day_step_hours) {
            print_row(options.day, hour, &options);
        }
        print_row(options.day, 24.0, &options);
    } else {
        print_row(options.day, options.hour, &options);
    }

    return EXIT_SUCCESS;
}
