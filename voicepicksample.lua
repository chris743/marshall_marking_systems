
-- Version 1.0 Old Voicepick plugin
--[[
--
--  VoicePick Code Generator Plugin
--  Created by Tobias Ringstrom
--	Documented and tested by Ren Akerlow
--
]]--
-- Version 1.1 Created by D.Contractor
--				1. fixed the bug when the orientation is different then GTIN + Lot# + Current Date //  Now it works with GTIN + Current Date + Lot#
--				2. Fixed the bug when end-user has multiple markers and plugin was selecting the marker without any GS1-128 barcode information.
-- Version 1.2 Created by D.Contractor
	-- 			1. Added the feature to work with any number of Markers.
		--      2. Bug Fixed: When end-user has multiple markers and they want to have voicepick message with two different formats in different markers
		--   		for example: First marker: GTIN+Lot#+Date and Second Marker = GTIN + Lot# and Third Marker: GTIN + Date + Lot#
		--  		in this case, user has to create two more variables which allows set specific voicepick code for GTIN + Lot# case.
		--			User has to change the message to direct the voicepick code to the Two other variables (VoicePick3 and VoicePick4)
   --Version 1.3 modified by J.V
      --Removed logs

function plugin_version()
	return "v1.3       SW PN: 86146704 - HW PN: 41221713"
end
function plugin_description()
    local desc = [[VOICE PICK GENERATOR
    PLUGIN DESCRIPTION:
         When this plugin will installed it will calculate the Voice Pick code
    based on the GTIN number and Lot# and Current Date. Whenever end-user select
    a message, it will allow them to verify voice pick that has been calculated.
    
    Version 1.3:
        Removed the logs to prevent clutter under Maintenance>Logs ]]
                
	return desc
end

function plugin_get_config_template()
	mperia.log_debug("get plugin template")
	template = {
	Enable = {type = "bool", default = true},
	CheckVar1 = {type = "string", default = "Lot#",info = "check if the data in this variable name has changed"},
	GTIN = {type= "string", default = "GTIN", info = "Enter the name of GTIN variable"}
	}
	return template
end
local tConfig = {}  --Local configuration table used to access configuration variables
local tVar1 = {}
local tVar2 = {}
local n = 0
local crc16_table = {
   0x0000, 0xc0c1, 0xc181, 0x0140, 0xc301, 0x03c0, 0x0280, 0xc241,
   0xc601, 0x06c0, 0x0780, 0xc741, 0x0500, 0xc5c1, 0xc481, 0x0440,
   0xcc01, 0x0cc0, 0x0d80, 0xcd41, 0x0f00, 0xcfc1, 0xce81, 0x0e40,
   0x0a00, 0xcac1, 0xcb81, 0x0b40, 0xc901, 0x09c0, 0x0880, 0xc841,
   0xd801, 0x18c0, 0x1980, 0xd941, 0x1b00, 0xdbc1, 0xda81, 0x1a40,
   0x1e00, 0xdec1, 0xdf81, 0x1f40, 0xdd01, 0x1dc0, 0x1c80, 0xdc41,
   0x1400, 0xd4c1, 0xd581, 0x1540, 0xd701, 0x17c0, 0x1680, 0xd641,
   0xd201, 0x12c0, 0x1380, 0xd341, 0x1100, 0xd1c1, 0xd081, 0x1040,
   0xf001, 0x30c0, 0x3180, 0xf141, 0x3300, 0xf3c1, 0xf281, 0x3240,
   0x3600, 0xf6c1, 0xf781, 0x3740, 0xf501, 0x35c0, 0x3480, 0xf441,
   0x3c00, 0xfcc1, 0xfd81, 0x3d40, 0xff01, 0x3fc0, 0x3e80, 0xfe41,
   0xfa01, 0x3ac0, 0x3b80, 0xfb41, 0x3900, 0xf9c1, 0xf881, 0x3840,
   0x2800, 0xe8c1, 0xe981, 0x2940, 0xeb01, 0x2bc0, 0x2a80, 0xea41,
   0xee01, 0x2ec0, 0x2f80, 0xef41, 0x2d00, 0xedc1, 0xec81, 0x2c40,
   0xe401, 0x24c0, 0x2580, 0xe541, 0x2700, 0xe7c1, 0xe681, 0x2640,
   0x2200, 0xe2c1, 0xe381, 0x2340, 0xe101, 0x21c0, 0x2080, 0xe041,
   0xa001, 0x60c0, 0x6180, 0xa141, 0x6300, 0xa3c1, 0xa281, 0x6240,
   0x6600, 0xa6c1, 0xa781, 0x6740, 0xa501, 0x65c0, 0x6480, 0xa441,
   0x6c00, 0xacc1, 0xad81, 0x6d40, 0xaf01, 0x6fc0, 0x6e80, 0xae41,
   0xaa01, 0x6ac0, 0x6b80, 0xab41, 0x6900, 0xa9c1, 0xa881, 0x6840,
   0x7800, 0xb8c1, 0xb981, 0x7940, 0xbb01, 0x7bc0, 0x7a80, 0xba41,
   0xbe01, 0x7ec0, 0x7f80, 0xbf41, 0x7d00, 0xbdc1, 0xbc81, 0x7c40,
   0xb401, 0x74c0, 0x7580, 0xb541, 0x7700, 0xb7c1, 0xb681, 0x7640,
   0x7200, 0xb2c1, 0xb381, 0x7340, 0xb101, 0x71c0, 0x7080, 0xb041,
   0x5000, 0x90c1, 0x9181, 0x5140, 0x9301, 0x53c0, 0x5280, 0x9241,
   0x9601, 0x56c0, 0x5780, 0x9741, 0x5500, 0x95c1, 0x9481, 0x5440,
   0x9c01, 0x5cc0, 0x5d80, 0x9d41, 0x5f00, 0x9fc1, 0x9e81, 0x5e40,
   0x5a00, 0x9ac1, 0x9b81, 0x5b40, 0x9901, 0x59c0, 0x5880, 0x9841,
   0x8801, 0x48c0, 0x4980, 0x8941, 0x4b00, 0x8bc1, 0x8a81, 0x4a40,
   0x4e00, 0x8ec1, 0x8f81, 0x4f40, 0x8d01, 0x4dc0, 0x4c80, 0x8c41,
   0x4400, 0x84c1, 0x8581, 0x4540, 0x8701, 0x47c0, 0x4680, 0x8641,
   0x8201, 0x42c0, 0x4380, 0x8341, 0x4100, 0x81c1, 0x8081, 0x4040,
}
function crc16(str)
   local crc = 0
   for i = 1, #str do
      crc = bit32.bxor(bit32.rshift(crc, 8),
		       crc16_table[1 + bit32.bxor(bit32.band(crc, 0xff),
						  string.byte(str, i))])
   end
   return crc
end
--application identifiers for GS1 128 codes
local aiTab = { -- prefix, extraPrefix, minData, extraData
   ["00"] =   { 0, 18,  0, false },
   ["01"] =   { 0, 14,  0, false },
   ["02"] =   { 0, 14,  0, false },
   ["10"] =   { 0,  0, 20,  true },
   ["11"] =   { 0,  6,  0, false },
   ["12"] =   { 0,  6,  0, false },
   ["13"] =   { 0,  6,  0, false },
   ["15"] =   { 0,  6,  0, false },
   ["17"] =   { 0,  6,  0, false },
   ["20"] =   { 0,  2,  0, false },
   ["21"] =   { 0,  0, 20,  true },
   ["22"] =   { 0,  0, 29,  true },
   ["240"] =  { 0,  0, 30,  true },
   ["241"] =  { 0,  0, 30,  true },
   ["242"] =  { 0,  0,  6,  true },
   ["250"] =  { 0,  0, 30,  true },
   ["251"] =  { 0,  0, 30,  true },
   ["253"] =  { 0, 13, 17,  true },
   ["254"] =  { 0,  0, 20,  true },
   ["30"] =   { 0,  0,  8,  true },
   ["310"] =  { 1,  6,  0, false },
   ["311"] =  { 1,  6,  0, false },
   ["312"] =  { 1,  6,  0, false },
   ["313"] =  { 1,  6,  0, false },
   ["314"] =  { 1,  6,  0, false },
   ["315"] =  { 1,  6,  0, false },
   ["316"] =  { 1,  6,  0, false },
   ["320"] =  { 1,  6,  0, false },
   ["321"] =  { 1,  6,  0, false },
   ["322"] =  { 1,  6,  0, false },
   ["323"] =  { 1,  6,  0, false },
   ["324"] =  { 1,  6,  0, false },
   ["325"] =  { 1,  6,  0, false },
   ["326"] =  { 1,  6,  0, false },
   ["327"] =  { 1,  6,  0, false },
   ["328"] =  { 1,  6,  0, false },
   ["329"] =  { 1,  6,  0, false },
   ["330"] =  { 1,  6,  0, false },
   ["331"] =  { 1,  6,  0, false },
   ["332"] =  { 1,  6,  0, false },
   ["333"] =  { 1,  6,  0, false },
   ["334"] =  { 1,  6,  0, false },
   ["335"] =  { 1,  6,  0, false },
   ["336"] =  { 1,  6,  0, false },
   ["337"] =  { 1,  6,  0, false },
   ["340"] =  { 1,  6,  0, false },
   ["341"] =  { 1,  6,  0, false },
   ["342"] =  { 1,  6,  0, false },
   ["343"] =  { 1,  6,  0, false },
   ["344"] =  { 1,  6,  0, false },
   ["345"] =  { 1,  6,  0, false },
   ["346"] =  { 1,  6,  0, false },
   ["347"] =  { 1,  6,  0, false },
   ["348"] =  { 1,  6,  0, false },
   ["349"] =  { 1,  6,  0, false },
   ["350"] =  { 1,  6,  0, false },
   ["351"] =  { 1,  6,  0, false },
   ["352"] =  { 1,  6,  0, false },
   ["353"] =  { 1,  6,  0, false },
   ["354"] =  { 1,  6,  0, false },
   ["355"] =  { 1,  6,  0, false },
   ["356"] =  { 1,  6,  0, false },
   ["357"] =  { 1,  6,  0, false },
   ["360"] =  { 1,  6,  0, false },
   ["361"] =  { 1,  6,  0, false },
   ["362"] =  { 1,  6,  0, false },
   ["363"] =  { 1,  6,  0, false },
   ["364"] =  { 1,  6,  0, false },
   ["365"] =  { 1,  6,  0, false },
   ["366"] =  { 1,  6,  0, false },
   ["367"] =  { 1,  6,  0, false },
   ["368"] =  { 1,  6,  0, false },
   ["369"] =  { 1,  6,  0, false },
   ["37"] =   { 0,  0,  8,  true },
   ["390"] =  { 1,  0, 15,  true },
   ["391"] =  { 1,  3, 15,  true },
   ["392"] =  { 1,  0, 15,  true },
   ["393"] =  { 1,  3, 15,  true },
   ["400"] =  { 0,  0, 30,  true },
   ["401"] =  { 0,  0, 30,  true },
   ["402"] =  { 0, 17,  0,  true },
   ["403"] =  { 0,  0, 30,  true },
   ["410"] =  { 0, 13,  0, false },
   ["411"] =  { 0, 13,  0, false },
   ["412"] =  { 0, 13,  0, false },
   ["413"] =  { 0, 13,  0, false },
   ["414"] =  { 0, 13,  0, false },
   ["415"] =  { 0, 13,  0, false },
   ["420"] =  { 0,  0, 20,  true },
   ["421"] =  { 0,  3,  9,  true },
   ["422"] =  { 0,  3,  0,  true },
   ["423"] =  { 0,  3, 12,  true },
   ["424"] =  { 0,  3,  0,  true },
   ["425"] =  { 0,  3,  0,  true },
   ["426"] =  { 0,  3,  0,  true },
   ["7001"] = { 0, 13,  0,  true },
   ["7002"] = { 0,  0, 30,  true },
   ["7003"] = { 0, 10,  0,  true },
   ["7004"] = { 0,  0,  4,  true },
   ["703"] =  { 1,  3, 27,  true },
   ["8001"] = { 0, 14,  0,  true },
   ["8002"] = { 0,  0, 20,  true },
   ["8003"] = { 0, 14, 16,  true },
   ["8004"] = { 0,  0, 30,  true },
   ["8005"] = { 0,  6,  0,  true },
   ["8006"] = { 0, 18,  0,  true },
   ["8007"] = { 0,  0, 30,  true },
   ["8008"] = { 0,  8,  4,  true },
   ["8018"] = { 0, 18,  0,  true },
   ["8020"] = { 0,  0, 25,  true },
   ["8100"] = { 0,  6,  0,  true },
   ["8101"] = { 0, 10,  0,  true },
   ["8102"] = { 0,  2,  0,  true },
   ["8110"] = { 0,  0, 70,  true },
   ["8200"] = { 0,  0, 70,  true },
   ["90"] =   { 0,  0, 30,  true },
   ["91"] =   { 0,  0, 30,  true },
   ["92"] =   { 0,  0, 30,  true },
   ["93"] =   { 0,  0, 30,  true },
   ["94"] =   { 0,  0, 30,  true },
   ["95"] =   { 0,  0, 30,  true },
   ["96"] =   { 0,  0, 30,  true },
   ["97"] =   { 0,  0, 30,  true },
   ["98"] =   { 0,  0, 30,  true },
   ["99"] =   { 0,  0, 30,  true },
}
local function gs1Split(s)
   gs1 = {}
   i = 0
   aiStr = ""
   while i < #s do
      aiStr = aiStr .. s:sub(i, i)
      i = i + 1
      ai = aiTab[aiStr]
      if ai then
	 aiStr = aiStr .. s:sub(i, i + ai[1] - 1)
	 i = i + ai[1]

	 if ai[4] then -- terminated
	    j = string.find(s, "\x1d", i)
	    if j == nil then -- end reached
	       gs1[aiStr] = s:sub(i)
	       i = #s
	    else
	       gs1[aiStr] = s:sub(i, j - 1)
	       i = j + 1
	    end
	 else
	    n = ai[2]
	    gs1[aiStr] = s:sub(i, i + n - 1)
	    i = i + n
	 end
	 aiStr = ""
      end
   end
   return gs1
end
local function gs1ToVoicePickCode(s)
   gs1 = gs1Split(s)
   gtin = gs1["01"]
   lot = gs1["10"]
   if gtin == nil or lot == nil then
      return ""
   end
   return string.format("%04u", crc16(gtin .. lot) % 10000)
end
local function gs1ToVoicePickCodeNew(s)
   return string.format("%04u", crc16(s) % 10000)
end
function translate(text, config)
   pc = gs1ToVoicePickCode(text)
   if config == "12" then
      return pc:sub(1, 2)
   elseif config == "34" then
      return pc:sub(3, 4)
   else
      return pc
   end
end
local function gs1CheckDigit(s)
	local sum = 0
	for i = 1, #s, 2 do
		sum = sum + s:sub(i,i)*3
	end
	for i = 2, #s, 2 do
		sum = sum + s:sub(i,i)*1
	end
	checkDigit = 10-sum%10
	return checkDigit
end
function plugin_textsource(environment, forPrint, configuration)
	--get current msg from xml port
	--parse for gs1 barcode
	--return VoicePick("TEST")
end
function plugin_hook_fixate(instID, printID)
	VoicePick(instID)
end
function plugin_hook_message_started(instID, printID)
	--VoicePick(instID)
end
function plugin_hook_db_row_selected(instID)
VoicePick(instID)
end
function plugin_hook_message_selected(instID, message)
	VoicePick(instID)

end

function plugin_message_selection(gui,instID)
	VoicePick(instID)
end
function VoicePick(instID)
--Voicepick codes is a 4 digit code representing the crc-16 checksum of the gtin and lot number of a gs1-128 barcode.
--the plugin function looksup the selected message and determines if a gs1-128 is in the message
	local instID, instName = mperia.lookup_installation(instID)
	mperia.log_debug("Message fixated on installation: " .. instName)
	
	local tmarker = mperia.get_markers(instID)
	local num_of_markers = #tmarker
	local marker
	for markerId,markerName in pairs(tmarker)do
		marker = markerName
		mperia.log_debug("marker",marker)
		mperia.log_debug("Marker ID", markerId)
		--if markerId == 3000 then
			--mperia.log_debug("I am inside the marker 3000")
			messageName = mperia.get_message(instID)
			mperia.log_debug("Message name is" .. tostring(messageName))
			--messageName= messageName:gsub(".-\\", "")
			--mperia.log_info("Message name is" .. tostring(messageName))
			mperia.log_debug(instID..marker..messageName)
			if messageName == "BLANK" then
				mperia.log_debug("Message is Blank")
			else
				local msgXML = mperia.marker.get_message(instID, marker, messageName, "STATIC_XML")
			--mperia.log_debug("MsgXMl is",tostring(msgXML))
				if msgXML:match("<gs1%-128.*>(.*)</gs1%-128>") ~= nil then
					--mperia.log_debug("message",msgXML)
					local gs1 = msgXML:match("<gs1%-128.*>(.*)</gs1%-128>")
					if gs1 then
				--if a gs1-128 exists, because MPERIA auto populates the gtin check digit check that the gtin14 contains 14 characters and if not calculate the checkdigit and append.
					local gtin14 = gs1:match("%(01%)(.-)%(")
				--local gtin15 = mperia.variable.get_for_inst(instName,tConfig["GTIN"])
					local gtin16 = mperia.variable.get_for_inst(instName,tConfig["CheckVar1"])

					local gtin17 = gs1:match("%(15%)(.-)%(")
					--mperia.log_debug("GTIN num is:"..gtin14)
					--mperia.log_debug("Lot# is:"..gtin16)
--mperia.log_debug("Date from the xml is:",gtin17)
					if #gtin14 == 13 then
						local CheckDigit = gs1CheckDigit(gtin14)
						mperia.log_debug("gtin CheckDigit:"..CheckDigit)
						gs1 = gs1:gsub(gtin14,gtin14..CheckDigit)
					end
				--MPERIA uses "()" to seperate the Application Identifiers or "AI" which need to be deleted for crc-16 calcs
					gtin18 = os.date("%y%m%d")
					--gs1 = gs1:gsub("%(.-%)","")
					if gtin14 ~= nil and gtin16 ~= nil and gtin17 == gtin18  then
						gs1 = gtin14 .. gtin16 .. gtin17
						mperia.log_debug("gs1 PlainText:"..gs1)
						voicePick = gs1ToVoicePickCodeNew(gs1)
						mperia.log_debug("number of characters" .. tostring(#gs1))
					else
						gs2 = gs1:gsub("%(.-%)","")
						--gs1 = gtin14 .. gtin16 .. gtin17
						mperia.log_debug("gs2 PlainText" .. gs2)
						mperia.log_debug("number of characters" .. tostring(#gs2))
						voicePick = gs1ToVoicePickCodeNew(gs2)
					end
					if voicePick then
						mperia.log_debug("voicePick:"..voicePick)
					end
					--if #gs1 == 30 then
						mperia.variable.set_for_inst(instID, "VoicePick1", voicePick:sub(1,2))
						mperia.variable.set_for_inst(instID, "VoicePick2", voicePick:sub(3,4))
					
					-- else
						-- mperia.variable.set_for_inst(instID, "VoicePick3", voicePick:sub(1,2))
						-- mperia.variable.set_for_inst(instID, "VoicePick4", voicePick:sub(3,4))
					-- end
				end
			else
				mperia.log_debug("There is no GS1-128 barcode exist in the Message")
			end
		end
		end
	return
	end


function CheckVariable()
	tInstallations = mperia.list_installations()
	for instID,instName in pairs(tInstallations) do
		local val = mperia.variable.get_for_inst(instID, tConfig.GTIN)
		local val_1 = mperia.variable.get_for_inst(instID, tConfig.CheckVar1)
		if tVar1[instID] then
			if tVar1[instID]~=val then
				tVar1[instID] = val
				mperia.log_debug("")
				VoicePick(instID)
			end
		else 
			tVar1[instID] = val
			VoicePick(instID)
		end
		if tVar2[instID] then
			if tVar2[instID] ~= val_1 then
				tVar2[instID] = val_1
				mperia.log_debug("")
				VoicePick(instID)
			end
		else
			tVar2[instID] = val_1
			VoicePick(instID)
		end
	end
end
function plugin_set_config(config)
		--[[sets configuration at bootup and whenever plugin config "ok" button pressed.]]
    mperia.log_debug("Set plugin configuration")
		--Update local configuration table
	tConfig = config
	if config.Enable then
		to = mperia.set_periodic_timeout(1, CheckVariable)
	else
		mperia.del_all_timeouts()
	end
end
