import { expect } from "chai";
import { getTestnetSignerBySender, Sender, setupTestEnv, TestEnv } from "../../utils/tests";

describe("RecoveryManager: deploy results", () => {
    let env: TestEnv;

    beforeEach(async () => {
        env = await setupTestEnv();
    });

    it("verify public vars", async () => {
        const verifyerAddress = await (await getTestnetSignerBySender(Sender.TwoFactorVerifyer)).getAddress();
        const accountsDeployerAddress = await (await getTestnetSignerBySender(Sender.AccountsDeployer)).getAddress();

        expect(await env.factory.getTwoFactorVerifier()).to.eq(verifyerAddress);
        expect(await env.factory.isDeployer(accountsDeployerAddress)).to.true;
    });
});
