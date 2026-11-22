// Specs call `request(app.getHttpServer())` on a server that is not listening, so supertest runs `server.listen(0)`, a wildcard bind
// on a random free port. On macOS a process that listens on 127.0.0.1 with the same port wins over a wildcard listener, and desktop
// apps (editors, language servers, CLI tools) do listen on random local ports. About once in a few thousand requests one of them
// answers instead of the test's app, and a spec fails with a 404, a 401 that comes back as 200, or "socket hang up", on a different
// spec each run. A retry gets a new random port, so it passes. A real failure still fails on every attempt.
jest.retryTimes(2, { logErrorsBeforeRetry: true })
