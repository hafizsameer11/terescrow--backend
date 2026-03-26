
GET
Minimal exchange amount
https://api.changenow.io/v2/exchange/min-amount?fromCurrency=btc&toCurrency=usdt&fromNetwork=btc&toNetwork=eth&flow=standard
The API endpoint returns minimal payment amount required to make an exchange. If you try to exchange less, the transaction will most likely fail.

You can find examples of errors in the Example request block (use the drop-down list).

Request Parameters:
HEADERS
x-changenow-api-key
your_api_key

(Required) Partner's api key

PARAMS
fromCurrency
btc

(Required) Ticker of the currency you want to exchange

toCurrency
usdt

(Required) Ticker of the currency you want to receive

fromNetwork
btc

(Optional) Network of the currency you want to exchange

toNetwork
eth

(Optional) Network of the currency you want to receive

flow
standard

(Optional) Type of exchange flow. Enum: ["standard", "fixed-rate"]. Default value is standard

Example Request
Successfull response
View More
curl
curl --location 'https://api.changenow.io/v2/exchange/min-amount?fromCurrency=btc&toCurrency=usdt&fromNetwork=btc&toNetwork=eth&flow=standard' \
--header 'x-changenow-api-key: your_api_key'
200 OK
Example Response
Body
Headers (20)
json
{
  "fromCurrency": "btc",
  "fromNetwork": "btc",
  "toCurrency": "usdt",
  "toNetwork": "eth",
  "flow": "standard",
  "minAmount": 0.0002787
}
GET
List of all available pairs
https://api.changenow.io/v2/exchange/available-pairs?fromCurrency=&toCurrency=&fromNetwork=&toNetwork=&flow=
This API endpoint returns the list of all available pairs. Some currencies get enabled or disabled from time to time, so make sure to refresh the list occasionally.

Notice that the resulting array will contain about 13000 pairs.

Access to this endpoint you can receive upon dedicated request to partners@changenow.io

Successful response:
The response contains an array of underscore separated pair of tickers.

You can find examples of errors in the Example request block (use the drop-down list).

Request Parameters:
HEADERS
x-api-key
your_api_key

PARAMS
fromCurrency
Ticker of the currency you want to exchange

toCurrency
Ticker of the currency you want to receive

fromNetwork
Network of the currency you want to exchange

toNetwork
Network of the currency you want to receive

flow
Type of exchange flow. Enum: ["standard", "fixed-rate"]

Example Request
Successful response
View More
curl
curl --location 'https://api.changenow.io/v2/exchange/available-pairs?fromCurrency=&toCurrency=&fromNetwork=&toNetwork=&flow=' \
--header 'x-changenow-api-key: your_api_key'
200 OK
Example Response
Body
Headers (16)
View More
json
[
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "btc",
    "toNetwork": "btc",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "etc",
    "toNetwork": "etc",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "neo",
    "toNetwork": "neo",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "ada",
    "toNetwork": "ada",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "xlm",
    "toNetwork": "xlm",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "trx",
    "toNetwork": "trx",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "xrp",
    "toNetwork": "xrp",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "usdc",
    "toNetwork": "eth",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "dgb",
    "toNetwork": "dgb",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "xtz",
    "toNetwork": "xtz",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "atom",
    "toNetwork": "atom",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  },
  {
    "fromCurrency": "eth",
    "fromNetwork": "eth",
    "toCurrency": "gas",
    "toNetwork": "neo",
    "flow": {
      "standard": true,
      "fixed-rate": false
    }
  }
]
GET
Estimated exchange network fee
https://api.changenow.io/v2/exchange/network-fee?fromCurrency=usdt&toCurrency=usdt&fromNetwork=eth&toNetwork=eth&fromAmount=100&convertedCurrency=usd&convertedNetwork=usd
This endpoint provides an estimated value that will be spent on paying network fees during an exchange.

This number is ALREADY included in the estimate.

Access to this endpoint you can receive upon dedicated request to partners@changenow.io

SUCCESSFUL RESPONSE:
The response contains the ‘estimatedFee’ object and 'deposit', 'withdrawal', 'totals', and 'converted' fields inside it.

SUCCESSFUL RESPONSE FIELDS
View More
Name
Type
Description
estimatedFee
Object
Object that contains detailed info on the network fee estimation.
deposit
Object
Object that contains detailed info on the deposit network fees.
currency
String
Deposit currency's ticker.
network
String
Deposit currency's network.
amount
Number
Network fee in the deposit currency.
withdrawal
Object
Object that contains detailed info on the withdrawal network fees.
currency
String
Withdrawal currency's ticker.
network
String
Withdrawal currency's network.
amount
Number
Network fee in the withdrawal currency.
totals
Object
Object that contains combined network fee in deposit or withdeawal currency.
from
Object
Object that contains combined network fee estimated to the deposit currency.
to
Object
Object that contains combined network fee estimated to the withdrawal currency.
converted
Object
Object that contains detailed info on the network fee estimation in select currency.
currency
String
Network fee currency's ticker.
network
String
Network of currency's ticker.
deposit
Number
Deposit fee in the selected currency.
withdrawal
Number
Withdrawal fee in the selected currency.
total
Number
Combined network fee in selected currency.
HEADERS
x-changenow-api-key
your_api_key

Kindly contact your account manager if you're getting an Unauthorized error.

PARAMS
fromCurrency
usdt

(Required) Ticker of the currency you want to exchange

toCurrency
usdt

(Required) Ticker of the currency you want to receive

fromNetwork
eth

(Optional) Used to disambiguate multichain currencies.

toNetwork
eth

(Optional) Used to disambiguate multichain currencies.

fromAmount
100

(Required if type is direct) Must be greater then 0.

convertedCurrency
usd

(Optional) Ticker of the currency you want to convert

convertedNetwork
usd

(Optional) Used to disambiguate multichain currencies.

Example Request
200 | Success response
View More
curl
curl --location 'https://api.changenow.io/v2/exchange/network-fee?fromCurrency=eth&toCurrency=btc&fromNetwork=eth&toNetwork=btc&fromAmount=23&convertedCurrency=usd&convertedNetwork=usd' \
--header 'x-changenow-api-key: your-api-key'
Example Response
Body
Headers (0)
View More
json
{
  "estimatedFee": {
    "deposit": {
      "currency": "usdt",
      "network": "eth",
      "amount": 45.92863112
    },
    "withdrawal": {
      "currency": "usdt",
      "network": "eth",
      "amount": 28.74922176
    },
    "totals": {
      "from": {
        "currency": "usdt",
        "network": "eth",
        "amount": 74.67785288
      },
      "to": {
        "currency": "usdt",
        "network": "eth",
        "amount": 74.67785288
      }
    },
    "converted": {
      "currency": "usd",
      "network": "usd",
      "deposit": 45.8703857911131,
      "withdrawal": 28.712762848949975,
      "total": 74.58314864006307
    }
  }
}
GET
Market estimate fiat and crypto
https://api.changenow.io/v2/markets/estimate?fromCurrency=usdt&toCurrency=btc&fromAmount=1000&toAmount&type=direct
This API endpoint provides the direct and reverse market crypto-to-crypto, fiat-to-crypto or crypto-to-fiat estimated amounts.
Attention! Do not use this endpoint for financial aims, only for informational! These rates don't include any fees.
To work with this endpoint, provide your API key in the X-CHANGENOW-API-KEY title.
To calculate the direct estimated amount, set: fromCurrency, toCurrency, fromAmount, type: direct
To calculate the reverse estimated amount, set: fromCurrency, toCurrency, toAmount, type: reverse

Access to this endpoint you can receive upon dedicated request to partners@changenow.io

Successful response:
Successful response fields
View More
Name
Type
Description
fromCurrency
String
“From” currency
toCurrency
String
“To” currency
fromAmount
Number
The amount of “from” currency
toAmount
Number
The amount of “to” currency
type
String
The type of the estimated amount — direct or reverse
Request Parameters:
HEADERS
x-changenow-api-key
your_api_key

Partner's api key

PARAMS
fromCurrency
usdt

(Required) "From" currency

toCurrency
btc

(Required) "To" currency

fromAmount
1000

(Optional) Set if this is a direct type of the estimated amount

toAmount
(Optional) Set if this is a reverse type of the estimated amount

type
direct

(Optional) Valid values: [direct, reverse] If the type is not set, ‘direct’ is used by default.

Example Request
Bad request
View More
curl
curl --location 'https://api.changenow.io/v2/markets/estimate?fromCurrency=usdt&toCurrency=btc&fromAmount=1000&toAmount=null&type=reverse' \
--header 'x-changenow-api-key: your_api_key'
400 Bad Request
Example Response
Body
Headers (12)
json
{
  "error": "bad_params",
  "message": "toAmount is required if type is reverse"
}
GET
Exchanges
https://api.changenow.io/v2/exchanges?limit=10&offset=0&sortDirection=&sortField=&dateField=&statuses
The API endpoint returns a list of partner transactions according to the selected parameters.

Successful response:
Successful response fields
View More
Name
Type
Description
    count
Number
The number of exchanges found by the selected parameters
exchanges
    createdAt
String
Date and time when the transaction was created
    updatedAt
String
Date and time of the last transaction update (e.g. status update)
    exchangeId
String
    requestId
Transaction ID
Transaction ID
    status
String
Transaction status:
waiting,
confirming,
exchanging,
sending,
finished,
failed,
refunded,
verifying
    validUntil
String
Date and time of transaction validity
    flow
String
Type of exchange flow:
standard
fixed-rate
payin
    currency
String
Ticker of the currency sent by the user
    address
String
Generated wallet address to which the user sent the deposit
    extraId
String
Extra ID for currencies that require it
    amount
Number
The actual amount of the deposit sent by the user
    expectedAmount
Number
Initially indicated amount that the user plans to exchange
    hash
String
The hash of the deposit transaction that the user sent to the payin address
payout
    currency
String
Ticker of the currency for which the user exchanged his funds
    address
String
The wallet address to which the funds were received after the exchange
    extraId
String
Extra ID for currencies that require it
    hash
String
Hash of the transaction sending funds after the exchange
refund
    currency
String
Ticker of the currency of refund
    address
String
Refund address
    extra_id
String
Extra ID for currencies that require it
    hash
String
The hash of the transaction refunded to the user
partnerInfo
    commission
        currency
String
Ticker of the currency sent by the user
        amount
Number
Commission size in currency
        percent
Number
Percentage of commission
    userId
String
A personal and permanent identifier under which information is stored in the database (If you would like to enable this field, please contact us at partners@changenow.io with the subject line "Special partner fields")
    payload
Array
Object that can contain up to 5 arbitrary fields up to 64 characters long;
(If you would like to enable this field, please contact us at partners@changenow.io with the subject line "Special partner fields")
You can find examples of errors in the Example request block (use the drop-down list).

Request Parameters:
HEADERS
x-changenow-api-key
newprivateapikey

Partner's api key

PARAMS
limit
10

(Optional) Limit of transactions to return (default: 100)

Note: You can only specify limit bigger than 0 and less than 100

offset
0

(Optional) Number of transactions to skip (default: 0)

Note: You can only specify offset bigger than 0

sortDirection
(Optional) Sort ascending or descending. Enum: ["ASC", "DESC"]

sortField
(Optional) Sort by selected field. Enum: ["createdAt", "updatedAt"]

dateField
(Optional) Sort by date. Enum: ["createdAt", "updatedAt"]

dateFrom
(Optional) Set a date to filter transactions created after this specified date.

Format: YYYY-MM-DDTHH:mm:ss.sssZ

dateTo
(Optional) Set a date to filter transactions created before this specified date.

Format: YYYY-MM-DDTHH:mm:ss.sssZ

requestId
(Optional) Transaction ID.

userId
(Optional) Sort by userId

payoutAddress
(Optional) Sort by payoutAddress

statuses
