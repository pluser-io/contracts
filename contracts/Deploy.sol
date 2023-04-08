// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/metatx/MinimalForwarder.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";

import "./modules/RecoveryManager.sol";
import "./guards/TwoFactorGuard.sol";
import "./scripts/InitializationScriptV1.sol";
import "./Factory.sol";

contract Deploy is Ownable {
    MinimalForwarder public forwarder;
    RecoveryManager public singeltonRecoveryManager;

    GnosisSafe public gnosisSingleton;
    InitializationScriptInterface public initScript;

    Factory public factory;

    function step1(bytes calldata minimalForwarderCreationBytecode_, bytes calldata recoveryManagerCreationBytecode_) public onlyOwner {
        address _forwarder = Create2.deploy(0, keccak256("MinimalForwarder"), minimalForwarderCreationBytecode_);

        address _singeltonRecoveryManager = Create2.deploy(
            0,
            keccak256("RecoveryManager"),
            abi.encodePacked(recoveryManagerCreationBytecode_, abi.encode(_forwarder))
        );

        forwarder = MinimalForwarder(_forwarder);
        singeltonRecoveryManager = RecoveryManager(_singeltonRecoveryManager);
    }

    function step2(bytes calldata gnosisSafeCreationBytecode_, bytes calldata initScriptCreationBytecode_) public onlyOwner {
        require(address(forwarder) != address(0x00), "Forwarder is not deployed");
        require(address(singeltonRecoveryManager) != address(0x00), "RecoveryManager is not deployed");

        gnosisSingleton = GnosisSafe(payable(Create2.deploy(0, keccak256("GnosisSafe"), gnosisSafeCreationBytecode_)));
        initScript = InitializationScriptV1(Create2.deploy(0, keccak256("InitializationScriptV1"), initScriptCreationBytecode_));
    }

    function step3(bytes calldata factoryCreationBytecode_, address deployer, address verifyer) public onlyOwner {
        require(address(gnosisSingleton) != address(0x00), "Singleton is not deployed");
        require(address(initScript) != address(0x00), "InitScript is not deployed");
        require(address(factory) == address(0x00), "Factory is already deployed");

        address _singeltonFactory = Create2.deploy(0, keccak256("Factory"), factoryCreationBytecode_);

        Factory _factory = Factory(
            address(
                new ERC1967Proxy(
                    address(_singeltonFactory),
                    abi.encodeWithSelector(Factory.initialize.selector, initScript, gnosisSingleton, singeltonRecoveryManager, verifyer)
                )
            )
        );

        _factory.addDeployer(deployer);
        factory = _factory;
    }
}
