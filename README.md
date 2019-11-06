# CloudFront Update tools
![image](./ogp_light.png)

Simple CloudFront distribution config updator.

## Badges

[![NPM](https://nodei.co/npm/cloudfront-updator.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/cloudfront-updator/)  
[![npm version](https://badge.fury.io/js/cloudfront-updator.svg)](https://badge.fury.io/js/cloudfront-updator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Maintainability](https://api.codeclimate.com/v1/badges/c17851759423ce151b9e/maintainability)](https://codeclimate.com/github/hideokamoto/cloudfront-updator/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/c17851759423ce151b9e/test_coverage)](https://codeclimate.com/github/hideokamoto/cloudfront-updator/test_coverage)
[![Build Status](https://travis-ci.org/hideokamoto/cloudfront-updator.svg?branch=master)](https://travis-ci.org/hideokamoto/cloudfront-updator)

## Prepare

```
$ git clone YOUR_REPO_URI
$ cd YOUR_REPO_URI

// Put your GitHub Personal Access Token
$ mv .envrc.example .envrc
$ vim .envrc
export CONVENTIONAL_GITHUB_RELEASER_TOKEN=PUT_YOUR_GITHUB_ACCESS_TOKEN

// Install
$ yarn
or
$ npm install
```

### GitHub Personal Access Token Scope

If the project is private -> `repo`
If the project is public -> `public_repo`

## Commit message rule

The repository runs commitlint.
We have to follow "Conventional Commit" to make a commit message.

https://www.conventionalcommits.org/en/v1.0.0-beta.4/

```bash
$ git commit -m "<type>[optional scope]: <description>

[optional body]

[optional footer]"
```

## Contribution

```bash
// clone
$ git clone git@github.com:hideokamoto/cloudfront-updator.git
$ cd cloudfront-updator

// setup
$ yarn

// Unit test
$ yarn test
or
$ yarn run test:watch

// Lint
$ yarn run lint
or
$ yarn run lint --fix

// Build
$ yarn run build

// Rebuild docs
$ yarn run doc
```