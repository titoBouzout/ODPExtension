(function()
{

			var debugingThisFile = true;


			this.setFocusedLocation = function()
			{
				this.focusedURL = this.focusedLocation();
				this.focusedDomain = this.getDomainFromURL(this.focusedURL);
				this.focusedURLSubdomain = this.getSubdomainFromURL(this.focusedURL);
			}

	return null;

}).apply(ODPExtension);
