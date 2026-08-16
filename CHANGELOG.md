# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Custom Color Gradient** custom gradient defined by a start and end color

## [1.1.1] - 2026-05-03

### Fixed

- **Spacing and Placement** of heatmap inside the panel

## [1.1.0] - 2026-04-09

### Added

- **Last and First Aggregation** methods for days with multiple values
- **Empty Color** for days with no data can now be configured
- **Custom Color Themes**
- **Start of Week day** can be set to Saturday, Sunday, or Monday
- **Configurable Weekday Labels**: use numbers or custom text
- **Configurable Month Labels**, as well
- **Grafana 13 and React 19** support

### Changed

- **Improved Alignment and Spacing** of heatmap within the panel

### Fixed

- **Timezone-aware** bucket computing

## [1.0.4] - 2026-01-20

### Added

- **Localizations** based on the set up language in Grafana

### Changed

- **Readme** to contain the logo as a header
- **Dependency on Grafana 12**

### Fixed

- **Rectangle radius** is also applied when tooltip is active
- **Reverse shading** is being used when set to dark mode

## [1.0.3] - 2026-01-18

### Changed

- **Readme** to properly document what the plugin does

## [1.0.1] - 2026-01-17

### Added

- **Testing** to ensure proper functionality

### Fixed

- **CI Pipeline**

## [1.0.0] - 2026-01-17

### Added

#### Core Features

- **Calendar heatmap visualization** with GitHub-style grid layout displaying activity patterns across a full year
- **Real-time data updates** based on Grafana time range picker with automatic refresh when time range changes
- **Standard Grafana time-series data support** (DataFrame) with automatic detection and processing of timestamp-value pairs
- **GitHub contribution graph aesthetics** with familiar visual patterns for developers and data analysts

#### Color Schemes

- **6 built-in color palettes**: Green (GitHub-style), Blue (professional), Red (alerts/errors), Yellow (warnings), Purple (creative), Orange (energetic)
- **Theme-aware empty cell colors** that automatically adapt to Grafana's dark mode, light mode, and high-contrast themes
- **Dynamic color scaling** with 4 intensity levels providing clear visual distinction between low and high activity periods
- **Customizable color intensity mapping** with smart distribution algorithms for optimal visual contrast

#### Data Processing

- **5 aggregation methods** for handling multiple data points per day:
  - **Sum**: Total of all values (ideal for counts, quantities)
  - **Count**: Number of data points (useful for frequency analysis)
  - **Average**: Mean value (smooths out outliers)
  - **Maximum**: Highest value (highlights peak activity)
  - **Minimum**: Lowest value (identifies baseline activity)
- **Intelligent data handling** with automatic filtering of null, undefined, and NaN values to prevent visualization errors
- **Automatic precision control** with rounding to 2 decimal places for clean tooltip display
- **Robust timestamp parsing** supporting multiple date formats and timezone handling

#### Customization Options

- **Auto-sizing cells** that automatically adjust to fit panel width for optimal space utilization
- **Manual cell size control** with slider range from 8-20 pixels for fine-tuned appearance
- **Configurable cell spacing** from 1-24 pixels allowing tight or loose grid layouts
- **Adjustable corner radius** from 0-6 pixels for square to rounded cell appearance
- **Optional week day labels** (Sun-Sat) with abbreviated or full names
- **Optional month labels** (Jan-Dec) with intelligent positioning and responsive sizing
- **Optional legend display** with color intensity scale and value range indicators

#### User Interaction

- **Interactive hover tooltips** showing formatted date and aggregated value with customizable precision
- **Toggle tooltip visibility** for clean screenshots or presentation mode
- **Responsive layout** that gracefully adapts to various panel dimensions and screen sizes
- **Smooth hover animations** providing immediate visual feedback
- **Accessibility support** with proper ARIA labels and keyboard navigation

#### Technical Implementation

- **React 18.3.0** with modern functional components, hooks, and concurrent features
- **TypeScript 5.9.2** with strict type checking, ensuring type safety and better developer experience
- **Grafana SDK 12.3.1** full compatibility with latest Grafana APIs:
  - `@grafana/data` for DataFrame processing and time series handling
  - `@grafana/ui` for consistent theme integration and UI components
  - `@grafana/runtime` for plugin lifecycle and configuration management
  - `@grafana/schema` for type-safe configuration options
  - `@grafana/i18n` for internationalization support
- **@uiw/react-heat-map 2.3.3** for performant core heatmap visualization engine
- **Emotion CSS 11.10.6** for dynamic styling with theme integration and CSS-in-JS benefits

#### Development Infrastructure

- **Webpack 5 build system** with modern module federation and tree-shaking optimizations
- **SWC compilation** for ultra-fast TypeScript/JavaScript transformation
- **Jest 29 testing framework** with React Testing Library for comprehensive unit test coverage
- **Playwright 1.57** for end-to-end testing across multiple browsers and Grafana versions
- **ESLint 9** with comprehensive rule sets:
  - TypeScript-specific linting for type safety
  - React hooks rules for proper hook usage
  - JSDoc enforcement for better documentation
- **Prettier 3** for consistent code formatting across the entire codebase
- **Docker Compose development environment** with Grafana Enterprise for realistic testing scenarios
- **Plugin signing support** for official Grafana plugin catalog distribution
- **Automated build pipeline** with version management and artifact generation

#### Plugin Configuration

- **Grafana dependency**: Compatible with Grafana >=11.6.0
- **Plugin ID**: `tim012432-calendarheatmap-panel` for unique identification
- **Plugin type**: Panel plugin integrating seamlessly with Grafana's dashboard ecosystem
- **Keywords**: heatmap, calendar, github, contributions, activity for discoverability

#### Documentation & Assets

- **Comprehensive screenshots** demonstrating multiple themes and configurations:
  - Light theme with orange color scheme
  - Dark theme with green color scheme
  - Tron theme with blue color scheme
  - Configuration panel overview
- **Plugin logo** with SVG format for crisp display at any size
- **GitHub repository integration** with direct links to source code and issue tracking

#### Performance Optimizations

- **Efficient data rendering** with virtualized components for large datasets
- **Optimized re-rendering** using React.memo and useMemo for expensive calculations
- **Lazy loading** of non-critical components to improve initial load times
- **Memory-efficient** data structures preventing memory leaks in long-running dashboards

[unreleased]: https://github.com/tim0-12432/calendar-heatmap-panel/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/tim0-12432/calendar-heatmap-panel/releases/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/tim0-12432/calendar-heatmap-panel/releases/compare/v1.0.4...v1.1.0
[1.0.4]: https://github.com/tim0-12432/calendar-heatmap-panel/releases/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/tim0-12432/calendar-heatmap-panel/releases/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/tim0-12432/calendar-heatmap-panel/releases/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/tim0-12432/calendar-heatmap-panel/releases/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/tim0-12432/calendar-heatmap-panel/releases/tag/v1.0.0
