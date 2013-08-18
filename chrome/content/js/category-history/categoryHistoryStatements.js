(function()
{
		var debugingThisFile = false;//sets debuging on/off for this JavaScript file

		this.categoryHistoryStatements = function()
		{
			this.insertCategoryHistory = this.db.query(<sql>INSERT INTO `categories_history` ( `categories_history_category` ) VALUES (:categories_history_category) </sql>);
			this.updateCategoryHistory = this.db.query(<sql>
															UPDATE 
																`categories_history` 
															SET  
																`categories_history_hits`=`categories_history_hits`+1,
																`categories_history_date`=:categories_history_date,
																`categories_history_radiation`=`categories_history_radiation`+:categories_history_radiation
															WHERE
																`categories_history_category`= :categories_history_category
														</sql>);
			this.categoryHistoryGetMostVisitedLimit = this.db.query(<sql>
																		SELECT 
																			`categories_history_category` 
																		FROM  
																			`categories_history` 
																		ORDER BY 
																			`categories_history_radiation` DESC, 
																			`categories_history_category` DESC LIMIT 50
																	</sql>);
			this.categoryHistoryGetHistory =   this.db.query(<sql>
																 		SELECT 
																			`categories_history_category` 
																		FROM  
																			`categories_history`
																		ORDER BY
																			LENGTH(`categories_history_category`) asc
																</sql>);
		}
	return null;

}).apply(ODPExtension);
