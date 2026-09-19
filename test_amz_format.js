fetch("https://www.amazon.jobs/en/search.json?offset=0&result_limit=1&job_type%5B%5D=Full-Time&country%5B%5D=GBR")
    .then(r => r.json())
    .then(d => {
        const j = d.jobs[0];
        if (j) {
            console.log("description:", j.description.substring(0, 200));
        }
    });
