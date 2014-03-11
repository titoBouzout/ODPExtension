(function () {
	//sets debuging on/off for this JavaScript file

	var debugingThisFile = true;
	var db, query;
	this.addListener('databaseReady', function () {

		db = ODPExtension.rdfDatabaseOpen();
		if (db.exists) {

			query_subcategories = db.query(' \
												 	SELECT \
														* \
													FROM \
														`categories`  \
													where \
														`category` GLOB  :category \
												');

			//sql query
			query_find_relcat = db.query(' \
												 	SELECT \
														* \
													FROM \
														`categories`   \
													where \
														`category` GLOB  :top \
														and `depth` < :depth \
														and `category_reversed` GLOB :name \
												');
			query_parents_same_name = db.query(' \
												 	SELECT \
														c.`category` \
													FROM \
														`categories` c , \
														`related` r \
													where \
														r.`to` IN \
														( \
														 	SELECT \
																c.`id` \
															FROM \
																`categories` c  \
															WHERE \
																c.`category` = :category \
														 ) AND \
														c.`id` = r.`from` \
													order by \
														r.`from` asc \
												');
		}
	});
	this.rdfFindRelatedAndLinksMissing = function (aCategory) {

		var aMsg = 'Missing Related and @Links to/from "{CATEGORY}" ({RESULTS})'; //informative msg and title of document

		query_subcategories.params('category', aCategory + '*')

		//searching
		var row, relcat, rows = [],
			aData = '';
		for (var results = 0; row = query_subcategories.fetchObjects();) {

			var top = this.categoryGetTop(row.category)
			var name = this.categoryGetLastTwoChildName(row.category)

			query_find_relcat.params('top', top + '*')
			query_find_relcat.params('depth', row.depth)
			query_find_relcat.params('name', '/' + name.split('').reverse().join('') + '*')

			var result = ''
			var current_relcats = this.rdfGetCategoryRelatedCategoriesFromCategoryID(row.id)
			var isRegional = this.categoryIsRegional(row.category)
			var isAboutACountry = this.categoryIsAboutCountry(row.category)
			var countryName = this.categoryGetCountryName(row.category)
			var continentName = this.categoryGetCountryContinentName(row.category)
			var linkedFrom = this.rdfGetCategoryLinksToCategoryID(row.id)

			var allOK = true;
			while (relcat = query_find_relcat.fetchObjects()) {
				//if its about a country, and the relcat is about another country continue
				//if is about a country, and the relcat is about another continent continue
				if (
					isRegional && this.categoryIsRegional(relcat.category) && isAboutACountry && this.categoryIsAboutCountry(relcat.category) && countryName != this.categoryGetCountryName(relcat.category) &&
					(

						(
							(relcat.category.indexOf('Regional/') === 0 && this.subStrCount(relcat.category.replace(name + '/', ''), '/') > 3) ||
							relcat.category.indexOf('Regional/') !== 0 && this.subStrCount(relcat.category.replace(name, ''), '/') > 4
						) ||
						continentName != this.categoryGetCountryContinentName(relcat.category)
					)
				)
					continue;

				var links = ''
				if (linkedFrom.indexOf(relcat.category) == -1 && linkedFrom.indexOf(relcat.category + 'Regional/') == -1) {
					links = '<span class="red"><b>@</b></span>';
					allOK = false;
				} else {
					links = '<span class="green"><b>@</b></span>';
				}

				if (current_relcats.indexOf(relcat.category) == -1) {
					result += '<br> -> ' + links + ' ' + relcat.category
					allOK = false
				} else {
					result += '<br> -> ' + links + ' <span class="green">' + relcat.category + '</span>'
				}

			}
			if (result != '' && !allOK) {
				aData += row.category
				aData += result
				aData += '<hr>'
				results++
			}
		}

		//sets msg
		aMsg = aMsg.replace('{CATEGORY}', aCategory).replace('{RESULTS}', results);

		//display results
		if (results > 0)
			this.tabOpen(this.fileCreateTemporal(
				'RDF.html',
				aMsg,
				'<div class="header">' + aMsg + '</div>' +
				'<pre style="background-color:white !important;padding:2px;text-align:right">' + aData +
				'</pre>'), true);
		else
			this.notifyTab(aMsg, 8);

	}
	return null;

}).apply(ODPExtension);