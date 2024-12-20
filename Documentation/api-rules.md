## Rules for the API and Data Management
---

1. The ID column will be created using the following values: **112hr118**
    1. **`billNumber` - 112**
    2. **`billType` - hr**
    3. **`congress` - 118**
2. Each Endpoint has parameters. If I specify a parameter for an endpoint then that needs to be specified otherwise leave it empty.
3. For the 'format' parameter, it needs to be 'json'.
4. For a unique ID, there can be multiple rows with the same ID and in the columns there can be null values some of the time and that is okay.
5. If a column has a value like sponsors:bioguideId, then the value is the bioguideId of the sponsor.
6. There can be a table called 'cosponsors where there can be multiple rows of data for a unique ID so in the cosponsors:firstName we will have multiple rows of data for a unique ID. This is okay.