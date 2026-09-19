fetch("https://cg-jobstream-api.azurewebsites.net/api/job-search?country_code=en-gb%2Cgb-en&page=1&size=2")
  .then(r => r.json())
  .then(d => {
     console.log(d.data[0].location);
     console.log(typeof d.data[0].location);
  });
