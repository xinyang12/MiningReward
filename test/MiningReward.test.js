const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect } = require('chai');
const assert = require('assert');

// Import utilities from Test Helpers
const { BN, expectEvent, expectRevert, balance } = require('@openzeppelin/test-helpers');

const MiningReward = contract.fromArtifact('MiningReward');
const MockERC20 = contract.fromArtifact('MockERC20');

describe('MiningReward', function () {
    const [owner, other] = accounts;

    // // Use large integers ('big numbers')
    // const value = new BN('10');

    // 每个测试执行前执行
    beforeEach(async function () {
        this.mockRewardToken = await MockERC20.new('MockERC20', 'MockERC20', { from: owner });
        this.contract = await MiningReward.new({ from: owner });
        await this.contract.initialize(owner, other, this.mockRewardToken.address, { from: owner });
        await expectRevert(
            this.contract.initialize(owner, this.mockRewardToken.address, other, { from: owner }),
            'Contract instance has already been initialized'
        );
    });

    // 测试 构造函数
    it('constructor', async function () {
        // const index = await this.contract.index({ from: owner, value: value });

        // 测试管理员
        assert.equal(await this.contract.admin(), owner);
        assert.equal(await this.contract.coinAdmin(), other);
    });

    // 测试 批量设置
    it('batchSet', async function () {
        const accounts = [owner, other];
        const ownerReward = new BN('1230000000000000000');
        const otherReward = new BN('1570000000000000000');
        const amounts = [ownerReward, otherReward]
        const datetime = new BN('1598889600');
        const receipt = await this.contract.batchSet(accounts, amounts, datetime, { from: owner });

        const ownerBalance = await this.contract.checkBalance(owner, { from: owner });
        const otherBalance = await this.contract.checkBalance(other, { from: other });

        expect(ownerBalance).to.be.bignumber.equal(ownerReward);
        expect(otherBalance).to.be.bignumber.equal(otherReward);
        expect(await this.contract.datetime()).to.be.bignumber.equal(datetime);

        // 测试重复交易（datetime重复）
        await expectRevert(
            this.contract.batchSet(accounts, amounts, datetime, { from: owner }),
            'Invalid time'
        );
        await expectRevert(
            this.contract.batchSet(accounts, amounts, datetime, { from: other }),
            'Admin required'
        );
        // 目前无法测试 array
        // expectEvent(receipt, 'BatchSet', { accounts: [accounts[0], accounts[1]], amounts: [amounts], datetime: datetime });

        const ownerReward2 = new BN('1520000000000000000');
        const otherReward2 = new BN('1380000000000000000');
        const amounts2 = [ownerReward2, otherReward2]
        const datetime2 = new BN('1598976000');
        await this.contract.batchSet(accounts, amounts2, datetime2, { from: owner });

        const ownerBalance2 = await this.contract.checkBalance(owner, { from: owner });
        const otherBalance2 = await this.contract.checkBalance(other, { from: other });

        expect(ownerBalance2).to.be.bignumber.equal(ownerReward.add(ownerReward2));
        expect(otherBalance2).to.be.bignumber.equal(otherReward.add(otherReward2));
        expect(await this.contract.datetime()).to.be.bignumber.equal(datetime2);

        const setReceipt = await this.contract.set(other, new BN('9482'), { from: owner });
        expect(await this.contract.checkBalance(other, { from: other })).to.be.bignumber.equal(new BN('9482'));
        expectEvent(setReceipt, 'Set', { account: other, amount: new BN('9482') });
        await expectRevert(
            this.contract.set(other, new BN('9482'), { from: other }),
            'Admin required'
        );

        const rewardBalance1 = await this.contract.checkRewardBalance();
        expect(rewardBalance1).to.be.bignumber.equal(new BN('0'));


        await this.mockRewardToken._mint(other, new BN('1000000000000000000000000000000'), { from: owner })
        await this.mockRewardToken.transfer(await this.contract.address, new BN('10000000000000000000000000000'), { from: other });

        const rewardBalance2 = await this.contract.checkRewardBalance();
        expect(rewardBalance2).to.be.bignumber.equal(new BN('10000000000000000000000000000'));

        const claimRewardReceipt = await this.contract.claimReward({ from: owner });
        expectEvent(claimRewardReceipt, 'ClaimReward', { addr: owner, amount: ownerReward.add(ownerReward2) });

        // const myBalance = await this.contract.checkMyBalance({ from: owner });
        // console.log(myBalance.toString());
        expect(await this.contract.checkBalance(owner, { from: owner })).to.be.bignumber.equal(new BN('0'));
        expect(await this.mockRewardToken.balanceOf(owner, { from: owner })).to.be.bignumber.equal(ownerReward.add(ownerReward2));
        const remainBalance1 = (new BN('10000000000000000000000000000')).sub(ownerReward.add(ownerReward2));
        expect(await this.contract.checkRewardBalance({ from: owner })).to.be.bignumber.equal(remainBalance1);

        await expectRevert(
            this.contract.withdrawRewardWithAmount(remainBalance1.sub(new BN('1')), { from: owner }),
            'Admin required'
        );
        await this.contract.withdrawRewardWithAmount(remainBalance1.sub(new BN('1')), { from: other });
        expect(await this.mockRewardToken.balanceOf(owner, { from: owner })).to.be.bignumber.equal(ownerReward.add(ownerReward2).add(remainBalance1.sub(new BN('1'))));
        expect(await this.contract.checkRewardBalance({ from: owner })).to.be.bignumber.equal(new BN('1'));

        await expectRevert(
            this.contract.claimReward({ from: other }),
            'Insufficient rewardToken'
        );

        await this.contract.set(other, new BN('0'), { from: owner });
        await expectRevert(
            this.contract.claimReward({ from: other }),
            'No reward'
        );
        expect(await this.contract.checkBalance(other, { from: other })).to.be.bignumber.equal(new BN('0'));
    });

    it('withdraw', async function () {
        await this.mockRewardToken._mint(owner, new BN('1000000000000000000000000000000'), { from: owner });
        await this.mockRewardToken.transfer(this.contract.address, new BN('1000000000000000000000000000000'), { from: owner });
        expect(await this.contract.checkRewardBalance({ from: owner })).to.be.bignumber.equal(new BN('1000000000000000000000000000000'));

        await expectRevert(
            this.contract.withdrawRewardWithAmount(new BN('1'), { from: owner }),
            'Admin required'
        );
        const withreceipt1 = await this.contract.withdrawRewardWithAmount(new BN('100000000000000000000000000000'), { from: other });

        expectEvent(withreceipt1, 'WithdrawRewardWithAmount', { amount: new BN('100000000000000000000000000000') });

        expect(await this.contract.checkRewardBalance({ from: owner })).to.be.bignumber.equal((new BN('1000000000000000000000000000000')).sub(new BN('100000000000000000000000000000')));
        expect(await this.mockRewardToken.balanceOf(owner, { from: owner })).to.be.bignumber.equal(new BN('100000000000000000000000000000'));

        await expectRevert(
            this.contract.withdrawReward({ from: owner }),
            'Admin required'
        );
        const withreceipt2 = await this.contract.withdrawReward({ from: other });
        expectEvent(withreceipt2, 'WithdrawReward', { amount: (new BN('1000000000000000000000000000000')).sub(new BN('100000000000000000000000000000')) });
        expect(await this.contract.checkRewardBalance({ from: owner })).to.be.bignumber.equal(new BN('0'));
        expect(await this.mockRewardToken.balanceOf(owner, { from: owner })).to.be.bignumber.equal(new BN('1000000000000000000000000000000'));
        await expectRevert(
            this.contract.withdrawRewardWithAmount(new BN('1'), { from: other }),
            'No reward left'
        );
        await expectRevert(
            this.contract.withdrawReward({ from: other }),
            'No reward left'
        );
    });

    it('withdrawToAddr', async function () {
        await this.mockRewardToken._mint(owner, new BN('1000000000000000000000000000000'), { from: owner });
        await this.mockRewardToken.transfer(this.contract.address, new BN('1000000000000000000000000000000'), { from: owner });
        expect(await this.contract.checkRewardBalance({ from: owner })).to.be.bignumber.equal(new BN('1000000000000000000000000000000'));

        await expectRevert(
            this.contract.withdrawRewardToAddressWithAmount(other, new BN('100000000000000000000000000000'), { from: owner }),
            'Admin required'
        );
        const withreceipt1 = await this.contract.withdrawRewardToAddressWithAmount(other, new BN('100000000000000000000000000000'), { from: other });

        expectEvent(withreceipt1, 'WithdrawRewardToAddressWithAmount', { addr: other, amount: new BN('100000000000000000000000000000') });

        expect(await this.contract.checkRewardBalance({ from: owner })).to.be.bignumber.equal((new BN('1000000000000000000000000000000')).sub(new BN('100000000000000000000000000000')));
        expect(await this.mockRewardToken.balanceOf(other, { from: owner })).to.be.bignumber.equal(new BN('100000000000000000000000000000'));

        await expectRevert(
            this.contract.withdrawRewardToAddress(other, { from: owner }),
            'Admin required'
        );
        const withreceipt2 = await this.contract.withdrawRewardToAddress(other, { from: other });
        expectEvent(withreceipt2, 'WithdrawRewardToAddress', { addr: other, amount: (new BN('1000000000000000000000000000000')).sub(new BN('100000000000000000000000000000')) });
        expect(await this.contract.checkRewardBalance({ from: owner })).to.be.bignumber.equal(new BN('0'));
        expect(await this.mockRewardToken.balanceOf(other, { from: owner })).to.be.bignumber.equal(new BN('1000000000000000000000000000000'));

        await expectRevert(
            this.contract.withdrawRewardToAddressWithAmount(other, new BN('1'), { from: other }),
            'No reward left'
        );
        await expectRevert(
            this.contract.withdrawRewardToAddress(other, { from: other }),
            'No reward left'
        );
    });
});
