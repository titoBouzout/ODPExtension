(function() {
	//sets debuging on/off for this JavaScript file

	var debugingThisFile = true;

	this.rdfFindAltlangsCategoriesWithoutOutgoing = function(aCategory) {
		this.rdfOpen(); //opens a connection to the RDF SQLite database.

		var aMsg = 'Categories without outgoing alternative languages on "{CATEGORY}" and on its subcategories ({RESULTS})'; //informative msg and title of document

		//sql query
		var query = this.DBRDF.query(' \
											 	SELECT \
													* \
												FROM \
													`PREFIX_categories` \
												where \
													`categories_path` GLOB  :categories_path and \
													`categories_id` not in \
													( \
													 	select \
															`altlang_id_from` \
														from \
															`PREFIX_altlang` \
													) \
												order by \
													categories_id asc \
											');
		query.params('categories_path', aCategory + '*');

		var row, rows = [],
			aData = '';
		for (var results = 0; row = this.DBRDF.fetchObjects(query); results++) {
			aData += row.categories_path;
			aData += this.__NEW_LINE__;
		}

		//sets msg
		aMsg = aMsg.replace('{CATEGORY}', aCategory).replace('{RESULTS}', results);

		//display results
		if (results > 0)
			this.tabOpen(this.fileCreateTemporal(
				'RDF.html',
				aMsg,
				'<div class="header">' + aMsg + '</div>' +
				'<pre style="background-color:white !important;padding:2px;">' + aData +
				'</pre>'), true);
		else
			this.notifyTab(aMsg, 8);
		this.rdfClose();
	}
	return null;

}).apply(ODPExtension);