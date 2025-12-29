Generate Polygon wallet
get
https://api.tatum.io/v3/polygon/wallet

/v3/polygon/wallet

1 credit per API call

Tatum supports BIP44 HD wallets. It is very convenient and secure, since it can generate 2^31 addresses from 1 mnemonic phrase. Mnemonic phrase consists of 24 special words in defined order and can restore access to all generated addresses and private keys.
Each address is identified by 3 main values:

Private Key - your secret value, which should never be revealed
Public Key - public address to be published
Derivation index - index of generated address
Tatum follows BIP44 specification and generates for Polygon wallet with derivation path m'/44'/966'/0'/0. More about BIP44 HD wallets can be found here - https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki. Generate BIP44 compatible Polygon wallet.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
mnemonic
string
length ≤ 500
Mnemonic to use for generation of extended public and private keys.

Responses

200
OK

Response body
object
mnemonic
string
required
Generated mnemonic for wallet.

xpub
string
required
Generated Extended public key for wallet with derivation path according to BIP44. This key can be used to generate addresses.


next add support of polygon 




Generate Polygon account address from Extended public key
get
https://api.tatum.io/v3/polygon/address/{xpub}/{index}

/v3/polygon/address/{xpub}/{index}

1 credit per API call

Generate Polygon account deposit address from Extended public key. Deposit address is generated for the specific index - each extended public key can generate up to 2^31 addresses starting from index 0 until 2^31.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
xpub
string
required
Extended public key of wallet.

index
number
required
Derivation index of desired address to be generated.

Responses

200
OK

Response body
object
address
string
Polygon address



Generate Polygon private key
post
https://api.tatum.io/v3/polygon/wallet/priv

/v3/polygon/wallet/priv

1 credit per API call

Generate private key of address from mnemonic for given derivation path index. Private key is generated for the specific index - each mnemonic can generate up to 2^31 private keys starting from index 0 until 2^31.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Body Params
index
integer
required
≤ 2147483647
Derivation index of private key to generate.

mnemonic
string
required
length between 1 and 500
Mnemonic to generate private key from.

Responses

200
OK

Response body
object
key
string
Generated private key.




newwd same format ad din the support for user when he singsup i have added it inside the wallet_currencies

also need help to add his supports insid ethe masterwallet too as we don't have master wallet for it 

i want for some more 

i'm sharing



dogecoin


Generate Dogecoin wallet
get
https://api.tatum.io/v3/dogecoin/wallet

/v3/dogecoin/wallet

1 credit per API call.

Tatum supports BIP44 HD wallets. It is very convenient and secure, since it can generate 2^31 addresses from 1 mnemonic phrase. Mnemonic phrase consists of 24 special words in defined order and can restore access to all generated addresses and private keys.
Each address is identified by 3 main values:

Private Key - your secret value, which should never be revealed
Public Key - public address to be published
Derivation index - index of generated address
Tatum follows BIP44 specification and generates for Dogecoin wallet with derivation path m'/44'/3'/0'/0. More about BIP44 HD wallets can be found here - https://github.com/litecoin/bips/blob/master/bip-0044.mediawiki. Generate BIP44 compatible Dogecoin wallet.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
mnemonic
string
length ≤ 500
Mnemonic to use for generation of extended public and private keys.

Responses

200
OK

Response body
object
mnemonic
string
required
Generated mnemonic for wallet.

xpub
string
required
Generated Extended public key for wallet with derivation path according to BIP44. This key can be used to generate addresses.



Generate Dogecoin deposit address from Extended public key
get
https://api.tatum.io/v3/dogecoin/address/{xpub}/{index}

/v3/dogecoin/address/{xpub}/{index}

1 credit per API call.

Generate Dogecoin deposit address from Extended public key. Deposit address is generated for the specific index - each extended public key can generate up to 2^31 addresses starting from index 0 until 2^31 - 1.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
xpub
string
required
Extended public key of wallet.

index
number
required
Derivation index of desired address to be generated.

Responses

200
OK

Response body
object
address
string
Dogecoin address



Generate Dogecoin private key
post
https://api.tatum.io/v3/dogecoin/wallet/priv

/v3/dogecoin/wallet/priv

2 credits per API call.

Generate private key for address from mnemonic for given derivation path index. Private key is generated for the specific index - each mnemonic can generate up to 2^32 private keys starting from index 0 until 2^31 - 1.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Body Params
index
integer
required
≤ 2147483647
Derivation index of private key to generate.

mnemonic
string
required
length between 1 and 500
Mnemonic to generate private key from.

Responses

200
OK

Response body
object
key
string
Generated private key.




// next is xrpc

get
https://api.tatum.io/v3/xrp/account

/v3/xrp/account

5 credits per API call.

Generate XRP account. Tatum does not support HD wallet for XRP, only specific address and private key can be generated.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Responses

200
OK

Response body
object
address
string
required
Generated account address.

secret
string
required
Generated secret for account.


need their support for masterwallet too 
