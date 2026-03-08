Based on our research, all the URLs used by the LWP package are configured across several .xml files. In order to get lwp.pkg to talk to a servers, you can follow two different paths:

* Setup a DNS server
    With this path, you setup a DNS server, then forward the two URLs listed below to your custom server

OR

* Update the xml files within the package with your custom server URL

There are quite a few other URLs throughout the package, but the goal of this document is to list only the ones relevant to the LWP server's core functionality: news, videos and folding. 

The default server URLs are always <b>https://www.cbe-world.com</b> and <b>https://www.k2.cbe-world.com</b>. To talk to your server, you will need to replace these URLs with <b>http://YourOwnServer</b>. Replace ONLY the url, but not any of the subfolders! For example:

<link>http://www.cbe-world.com/lwp/live_channel</link>

becomes

<link>http://www.yourserver.com/lwp/live_channel</link>

or

<key>aas_url</key><value>http://www.k2.cbe-world.com/aas/client</value>

becomes

<key>aas_url</key><value>http://www.yourserver.com/aas/client</value>


Without further ado:

* /USRDIR/Data/life_info/property.xml
This file configures access to authentication servers, as well as the location of the channel list. It's composed of <key>/<value> pairs, and all the URLs are in the <value>.

<key>ssl_verification</key> --> set this to disable

Update the URL in the following keys to your custom server
<key>location_stats_server</key>
<key>channel_list_url</key>
<key>aas_check_test_entitlement</key>
<key>test_channel_list_url</key>
<key>aas_url</key>
<key>cps_url</key>
<wss_url>wss_url</key>    

* /USRDIR/data/life_info/channel/channel_list.xml
Defines the location of a channel's zip file, as well as ChannelID, Title and plugin .xml location

The snipped below shows the basic structure of the channel_list. Update the URL in the following keys to your custom server. Each channel will have its own list of :args, be sure to update all of them!
<rss xmlns:lwp="URL">
    <channel>
    <link>URL</link>
        <item>
            <lwp:plugin><lwp:arg>URL</lwp:arg>
            </lwp:plugin>
        </item>
    <item>
        <lwp:asset url="URL"/>
        <lwp:contentPubDate url="URL"/>
    </item>
    </channel>
</rss>


* /USRDIR/data/life_info/live/FALPL0001/globe.xml
Used by the AlphaClock channel, this file defines the location of all the images and the text snippets from the wikipedia.
<rss xmlns:lwp="" xmlns:live="">
    <channel>
        <link>URL</link>
        <live:pic url="URL"/>        
        <live:style>
            <live:bullet url=""/>
        </live:style>
        <item>
            <live:item url=""/>
            <live:media url=""/>
        </item>
    </channel>
</rss>

* /USRDIR/data/life_info/live/FLWP00001/city_info.xml
The real meat and potatoes of the Live channel, this is what defines all the locations and the news items displayed in each location. Each item has an URL for the thumbnail, but the new items themselves come from google! (or RSSHub, in our case)
<rss xmlns:live="URL" mlxns:lwp="URL">
    <channel>
        <fh:incremental>false</fh:incremental>
        <link>URL</link>
        <item>
            <live:thumbnail url="URL"/>
        </item>
    </channel>
</rss>

* /USRDIR/data/life_info/live/FLWP00001/city_diff.xml
Almost exactly the same as city_info.xml, but used to bring smaller subsets of changes. The key <b>fh:incremental</b> is used to tell the app to only load the cities within, instead of all the cities.

* /USRDIR/data/life_info/live/FLWP00001/cloud.xml
Used to load a cloud (the fluffy kind) overlay on top of the globe.
<rss xmlns:live="URL" xmlns:lwp="URL">
    <channel>
        <link>URL</link>
        <item>
            <live:cloud url="URL"/>
        </item>
    </channel>
</rss>