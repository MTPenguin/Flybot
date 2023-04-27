# flybot

> A GitHub App built with [Probot](https://github.com/probot/probot) that A Probot app

## Outline of process
### Create branch where the version is in the branch name as well as a new migrations file.  All branches will have a matching migration file.
Formatted BRANCH naming:   Jira-Scope-FromVersion
Formatted MIGRATION naming:   ToVersion__Jira-Scope-FromVersion
  JIR-123-data-v1.0.0.sql with current db version on data create.
  V1.0.1__JIR-123-data-v1.0.0.sql with new version on data merge.
  JIR-123-refData-v1.0.0.sql with current db version on refData create.
  V1.1.0__JIR-123-refData-v1.0.0.sql with new version on refData merge.
  JIR-123-schema-v1.0.0.sql with current db version on schema create.
  V2.0.0__JIR-123-schema-v1.0.0.sql with new version on schema merge.

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Teardown

```sh
# When stuck, get pid to kill -9 <PID>
lsof -i tcp:3000
COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    21278 BMac   24u  IPv6 0x9fe0588a70af83c5      0t0  TCP *:hbci (LISTEN)
node    21278 BMac   33u  IPv4 0x9fe0587747fb57ed      0t0  TCP localhost:58989->localhost:hbci (ESTABLISHED)
node    21278 BMac   34u  IPv6 0x9fe0588a70af38c5      0t0  TCP localhost:hbci->localhost:58989 (ESTABLISHED)
```

## Contributing

If you have suggestions for how flybot could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2023 MTPenguin
