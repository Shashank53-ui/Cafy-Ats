fetch("https://cg-jobstream-api.azurewebsites.net/api/job-search?country_code=en-gb%2Cgb-en&page=1&size=2")
  .then(r => r.json())
  .then(d => {
     console.log("Keys:", Object.keys(d));
     if(d.data && d.data.length > 0) {
         console.log("First item keys:", Object.keys(d.data[0]));
     } else {
         console.log("Data is undefined or empty");
         if (d.hits) console.log("It uses hits!");
     }
  });
