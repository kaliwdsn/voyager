let { spawn } = require("child_process")
let test = require("tape-promise/tape")
let { getApp, restart } = require("./launch.js")
let {
  navigate,
  newTempDir,
  waitForText,
  sleep,
  login,
  closeNotifications
} = require("./common.js")
let {
  addresses
} = require("../../app/src/renderer/connectors/lcdClientMock.js")
console.log(addresses)
let binary = process.env.BINARY_PATH

/*
* NOTE: don't use a global `let client = app.client` as the client object changes when restarting the app
*/

function cliSendCoins(home, to, amount) {
  let child = spawn(binary, [
    "client",
    "tx",
    "send",
    "--name",
    "testkey",
    "--to",
    to,
    "--amount",
    amount,
    "--home",
    home
  ])
  child.stdin.write("1234567890\n")
  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
}

test("wallet", async function(t) {
  let { app, home } = await getApp(t)
  // app.env.COSMOS_MOCKED = false
  await restart(app)

  let $ = (...args) => app.client.$(...args)

  await login(app, "testkey")

  let balanceEl = denom => {
    let balanceElemSlector = `//div[contains(text(), "${denom.toUpperCase()}")]`
    // app.client.getHTML("#part-available-balances").then(result => {
    //   console.log(result)
    // })
    return app.client.waitForExist(balanceElemSlector, 20000).then(() =>
      $(balanceElemSlector)
        .$("..")
        .$("div.ni-li-dd")
    )
  }

  t.test("send", async function(t) {
    async function goToSendPage() {
      await navigate(app, "Wallet")
      await $("#part-available-balances")
        .$(".ni-li-dt=FERMION")
        .$("..")
        .$("..")
        .click()
    }

    await navigate(app, "Wallet")

    let sendBtn = () => $(".ni-form-footer button")
    let addressInput = () => $("#send-address")
    let amountInput = () => $("#send-amount")
    let denomBtn = denom => $(`option=${denom.toUpperCase()}`)
    let defaultBalance = 9007199254740992
    t.test("fermion balance before sending", async function(t) {
      await app.client.waitForExist(
        `//span[contains(text(), "Send")]`,
        15 * 1000
      )

      let fermionEl = balanceEl("fermion")
      waitForText(() => fermionEl, defaultBalance.toString())
      t.end()
    })

    t.test("hit send with empty form", async function(t) {
      await goToSendPage()
      await sendBtn().click()
      t.equal(await sendBtn().getText(), "Send Tokens", "not sending")
      t.end()
    })

    t.test("address w/ less than or greater than 40 chars", async function(t) {
      await goToSendPage()
      await addressInput().setValue("012345")
      await sendBtn().click()
      await $("div*=Address is invalid (012345 too short)").waitForExist()
      t.pass("got correct error message")
      await sendBtn().click()
      t.equal(await sendBtn().getText(), "Send Tokens", "not sending")

      let fourtyOneZeros = "01234" + "0".repeat(36)

      await addressInput().setValue(fourtyOneZeros)

      await sendBtn().click()
      await $(
        "div*=Address is invalid (Invalid checksum for " + fourtyOneZeros + ")"
      ).waitForExist()
      t.pass("got correct error message")
      await sendBtn().click()
      t.equal(await sendBtn().getText(), "Send Tokens", "not sending")

      t.end()
    })

    t.test("address not alphaNum", async function(t) {
      await goToSendPage()
      await addressInput().setValue("~".repeat(40))

      await $(
        "div*=Address is invalid (No separator character for ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)"
      ).waitForExist()
      t.pass("got correct error message")

      await sendBtn().click()
      t.equal(await sendBtn().getText(), "Send Tokens", "not sending")
      t.end()
    })

    t.test("correct address mis-typed", async function(t) {
      await goToSendPage()
      let validAddress = addresses[0]
      let invalidAddress = validAddress.slice(0, -1) + "4"
      await addressInput().setValue(invalidAddress)

      await $(
        "div*=Address is invalid (Invalid checksum for " + invalidAddress + ")"
      ).waitForExist()
      t.pass("got correct error message")

      await sendBtn().click()
      t.equal(await sendBtn().getText(), "Send Tokens", "not sending")
      t.end()
    })

    t.test("amount set", async function(t) {
      await goToSendPage()
      await amountInput().setValue("100")
      await sendBtn().click()
      t.equal(await sendBtn().getText(), "Send Tokens", "not sending")

      t.end()
    })

    t.test("send", async function(t) {
      await goToSendPage()
      await amountInput().setValue("100")
      await addressInput().setValue(
        "cosmosaccaddr1xrnylx3l5mptnpjd4h0d52wtvealsdnv5k77n8"
      )
      await sendBtn().click()
      await app.client.waitForExist(".ni-notification", 10 * 1000)
      let msg = await app.client.$(".ni-notification .body").getText()
      console.log("msg", msg)
      t.ok(msg.includes("Success"), "Send successful")
      // close the notifications to have a clean setup for the next tests
      await closeNotifications(app)

      t.end()
    })

    t.test("own balance updated", async function(t) {
      await navigate(app, "Wallet")

      // TODO should not be necessary
      await sleep(1000)
      await app.client.$(".material-icons=refresh").click()

      let mycoinEl = () => balanceEl("fermion")
      await waitForText(mycoinEl, (defaultBalance - 100).toString(), 10000)
      t.pass("balance is reduced by 100")
      t.end()
    })

    t.end()
  })

  t.test("receive", async function(t) {
    t.test("fermion balance after receiving", async function(t) {
      await restart(app)
      await login(app, "testreceiver")
      await navigate(app, "Wallet")

      let fermionEl = () => balanceEl("fermion")
      await app.client.waitForExist(
        `//span[contains(text(), "Send")]`,
        15 * 1000
      )

      await waitForText(fermionEl, "100", 5000)
      t.pass("received mycoin transaction")
      t.end()
    })

    t.end()
  })

  t.end()
})
