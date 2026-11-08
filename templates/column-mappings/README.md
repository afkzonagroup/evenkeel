# Column-mapping templates (examples only)

These files are **examples**. They show how to map typical export layouts
to Evenkeel's configuration. They are not the documented format of any
payroll or HR product. **Verify every column name, gender code and number
format against your own export before use.**

Every template contains `"CHOOSE: …"` values for the choices the directive
leaves to you. Evenkeel rejects the file until you replace each with one of
the listed options (see [docs/configuration.md](../../docs/configuration.md)).

| File | Export layout |
|---|---|
| `example-annual-one-row-per-worker.json` | One row per worker for the year, comma-separated, `.` decimals |
| `example-monthly-rows-summed.json` | One row per worker and month, added up per worker; rows of other years left out |
| `example-semicolon-decimal-comma.json` | Semicolon-separated, `,` decimals, space as thousands separator |
| `example-hourly-only.json` | Hourly basis only |
