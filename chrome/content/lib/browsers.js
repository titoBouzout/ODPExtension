(function()
{
	//returns a browser from a aTab
	this.browserGetFromTab = function(aTab)
	{
		return gBrowser.getBrowserForTab(aTab);
	}

	return null;

}).apply(ODPExtension);
