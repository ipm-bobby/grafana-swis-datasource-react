# Contributing to SolarWinds SWIS React DataSource

Thank you for your interest in contributing to the SolarWinds SWIS React DataSource for Grafana! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

There are many ways to contribute to this project:

1. Reporting bugs
2. Suggesting enhancements
3. Submitting pull requests
4. Improving documentation

## Development Setup

1. **Fork and clone the repository**
   ```
   git clone https://github.com/YOUR-USERNAME/grafana-swis-datasource-react.git
   cd grafana-swis-datasource-react
   ```

2. **Install dependencies**
   ```
   npm install
   ```

3. **Development workflow**
   - Make your changes
   - Test your changes locally
   - Build the plugin: `bash build-plugin.sh`
   - Install to your local Grafana (optional): `bash build-plugin.sh --install`

## Pull Request Process

1. **Branch naming**
   - Use a descriptive branch name for your changes
   - Examples: `feature/support-for-x`, `fix/connection-issue`

2. **Commit messages**
   - Write clear and descriptive commit messages
   - Start with a verb in the present tense (e.g., "Add", "Fix", "Update")

3. **Before submitting a PR**
   - Ensure your code follows the project's coding style
   - Run tests: `npm test`
   - Update documentation if necessary
   - Make sure your code builds without errors: `npm run build`

4. **PR description**
   - Clearly describe what your PR does
   - Reference any related issues with the format `#issue-number`
   - Include screenshots if relevant

## Coding Style

- Follow the existing code style in the project
- Use TypeScript for type safety
- Document public functions and classes

## Testing

This project uses Jest for testing. Run tests with:
```
npm test
```

## Building

Build the plugin with:
```
bash build-plugin.sh
```

## Versioning

This project follows [Semantic Versioning](https://semver.org/).

## License

By contributing to this project, you agree that your contributions will be licensed under the project's Apache-2.0 license.

## Questions?

If you have any questions, please open an issue or reach out to the maintainers.